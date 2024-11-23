import { encode, encodeChat } from "gpt-tokenizer";
import type { ChatCompletionMessageParam } from "groq-sdk/resources/chat/completions";
import type { PRFile } from "./constants";
import {
  rawPatchStrategy,
  smarterContextPatchStrategy,
} from "./context/review";
import { GROQ_MODEL, type GroqChatModel } from "./llms/groq";

const ModelsToTokenLimits: Record<GroqChatModel, number> = {
  "mixtral-8x7b-32768": 32768,
  "gemma-7b-it": 32768,
  "llama3-70b-8192": 8192,
  "llama3-8b-8192": 8192,
};

export const REVIEW_DIFF_PROMPT = `You are PR-Reviewer, a language model designed to review git pull requests.
Your task is to provide constructive and concise feedback for the PR, and also provide meaningful code suggestions.

Example PR Diff input:
'
## src/file1.py

@@ -12,5 +12,5 @@ def func1():
code line that already existed in the file...
code line that already existed in the file....
-code line that was removed in the PR
+new code line added in the PR
 code line that already existed in the file...
 code line that already existed in the file...

@@ ... @@ def func2():
...


## src/file2.py
...
'

The review should focus on new code added in the PR (lines starting with '+'), and not on code that already existed in the file (lines starting with '-', or without prefix).

- ONLY PROVIDE CODE SUGGESTIONS
- Focus on important suggestions like fixing code problems, improving performance, improving security, improving readability
- Avoid making suggestions that have already been implemented in the PR code. For example, if you want to add logs, or change a variable to const, or anything else, make sure it isn't already in the PR code.
- Don't suggest adding docstring, type hints, or comments.
- Suggestions should focus on improving the new code added in the PR (lines starting with '+')
- Do not say things like without seeing the full repo, or full code, or rest of the codebase. Comment only on the code you have!

Make sure the provided code suggestions are in the same programming language.

Don't repeat the prompt in the answer, and avoid outputting the 'type' and 'description' fields.

Think through your suggestions and make exceptional improvements.`;

export const XML_PR_REVIEW_PROMPT = `As the PR-Reviewer AI model, you are tasked to analyze git pull requests across any programming language and provide comprehensive and precise code enhancements. Keep your focus on the new code modifications indicated by '+' lines in the PR. Your feedback should hunt for code issues, opportunities for performance enhancement, security improvements, and ways to increase readability. 

Ensure your suggestions are novel and haven't been previously incorporated in the '+' lines of the PR code. Refrain from proposing enhancements that add docstrings, type hints, or comments. Your recommendations should strictly target the '+' lines without suggesting the need for complete context such as the whole repo or codebase.

Your code suggestions should match the programming language in the PR, steer clear of needless repetition or inclusion of 'type' and 'description' fields.

Formulate thoughtful suggestions aimed at strengthening performance, security, and readability, and represent them in an XML format utilizing the tags: <review>, <code>, <suggestion>, <comment>, <type>, <describe>, <filename>. While multiple recommendations can be given, they should all reside within one <review> tag.

Also note, all your code suggestions should follow the valid Markdown syntax for GitHub, identifying the language they're written in, and should be enclosed within backticks (\`\`\`). 

Don't hesitate to add as many constructive suggestions as are relevant to really improve the effectivity of the code.

Example output:
\`\`\`
<review>
  <suggestion>
    <describe>[Objective of the newly incorporated code]</describe>
    <type>[Category of the given suggestion such as performance, security, etc.]</type>
    <comment>[Guidance on enhancing the new code]</comment>
    <code>
    \`\`\`[Programming Language]
    [Equivalent code amendment in the same language]
    \`\`\`
    </code>
    <filename>[name of relevant file]</filename>
  </suggestion>
  <suggestion>
  ...
  </suggestion>
  ...
</review>
\`\`\`

Note: The 'comment' and 'describe' tags should elucidate the advice and why it’s given, while the 'code' tag hosts the recommended code snippet within proper GitHub Markdown syntax. The 'type' defines the suggestion's category such as performance, security, readability, etc.`;

export const PR_SUGGESTION_TEMPLATE = `{COMMENT}
{ISSUE_LINK}

{CODE}
`;

const assignLineNumbers = (diff: string) => {
  const lines = diff.split("\n");
  let newLine = 0;
  const lineNumbers = [];

  for (const line of lines) {
    if (line.startsWith("@@")) {
      // This is a chunk header. Parse the line numbers.
      const match = line.match(/@@ -\d+,\d+ \+(\d+),\d+ @@/);
      newLine = parseInt(match[1]);
      lineNumbers.push(line); // keep chunk headers as is
    } else if (!line.startsWith("-")) {
      // This is a line from the new file.
      lineNumbers.push(`${newLine++}: ${line}`);
    }
  }

  return lineNumbers.join("\n");
};

export const buildSuggestionPrompt = (file: PRFile) => {
  const rawPatch = String.raw`${file.patch}`;
  const patchWithLines = assignLineNumbers(rawPatch);
  return `## ${file.filename}\n\n${patchWithLines}`;
};

export const buildPatchPrompt = async (file: PRFile) => {
  console.log(`🔍 buildPatchPrompt called for file: ${file.filename}`);
  let result;
  if (file.old_contents == null) {
    console.log('⚠️ No old contents, using rawPatchStrategy');
    result = rawPatchStrategy(file);
  } else {
    console.log('✨ Using smarterContextPatchStrategy');
    result = await smarterContextPatchStrategy(file);
  }
  
  return result;
};

export const getReviewPrompt = (diff: string): ChatCompletionMessageParam[] => {
  return [
    { role: "system", content: REVIEW_DIFF_PROMPT },
    { role: "user", content: diff },
  ];
};

export const getXMLReviewPrompt = (
  diff: string
): ChatCompletionMessageParam[] => {
  return [
    { role: "system", content: XML_PR_REVIEW_PROMPT },
    { role: "user", content: diff },
  ];
};

export const constructPrompt = async (
  files: PRFile[],
  patchBuilder: (file: PRFile) => Promise<string>,
  convoBuilder: (diff: string) => ChatCompletionMessageParam[]
) => {
  const patches = await Promise.all(files.map(patchBuilder));
  const diff = patches.join("\n");
  const convo = convoBuilder(diff);
  return convo;
};

export const getTokenLength = (blob: string) => {
  return encode(blob).length;
};

export const isConversationWithinLimit = (
  convo: any[],
  model: GroqChatModel = GROQ_MODEL
) => {
  // We don't have the encoder for our Groq model, so we're using
  // the one for gpt-3.5-turbo as a rough equivalent.
  const convoTokens = encodeChat(convo, "gpt-3.5-turbo").length;
  return convoTokens < ModelsToTokenLimits[model];
};
