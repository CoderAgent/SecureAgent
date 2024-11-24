import { ChatCompletionMessageParam } from "groq-sdk/resources/chat/completions";
import { PRSuggestion } from "../constants";

export const INLINE_FIX_PROMPT = `In this task, you are provided with a code suggestion in XML format, along with the corresponding file content. Your task is to radiate from this suggestion and draft a precise code fix. Here's how your input will look:

\`\`\`xml
  <suggestion>
    <describe>Your Description Here</describe>
    <type>Your Type Here</type>
    <comment>Your Suggestions Here</comment>
    <code>Original Code Here</code>
    <filename>File Name Here</filename>
  </suggestion>
\`\`\`

{file}

The 'comment' field contains specific code modification instructions. Based on these instructions, you're required to formulate a precise code fix. Bear in mind that the fix must include only the lines between the starting line (linestart) and ending line (lineend) where the changes are applied.

The modified code does not need to be standalone valid, but when integrated into the file, it should be error-free and functional. Include only the lines directly affected by the changes. Avoid using placeholders like 'rest of code...'

Please interpret the given directions and apply the necessary changes to the provided suggestion and file content. Make the modifications unambiguous and appropriate for utilizing in an inline suggestion on GitHub.`;

export const INLINE_FIX_FUNCTION = {
  name: "fix",
  description: "The code fix to address the suggestion and rectify the issue",
  parameters: {
    type: "object",
    properties: {
      comment: {
        type: "string",
        description: "Why this change improves the code",
      },
      code: {
        type: "string",
        description: "Modified Code Snippet",
      },
      lineStart: {
        type: "number",
        description: "Starting Line Number",
      },
      lineEnd: {
        type: "number",
        description: "Ending Line Number",
      },
    },
  },
  required: ["action"],
};

const INLINE_USER_MESSAGE_TEMPLATE = `{SUGGESTION}

{FILE}`;

const assignFullLineNumers = (contents: string): string => {
  const lines = contents.split("\n");
  let lineNumber = 1;
  const linesWithNumbers = lines.map((line) => {
    const numberedLine = `${lineNumber}: ${line}`;
    lineNumber++;
    return numberedLine;
  });
  return linesWithNumbers.join("\n");
};

export const getInlineFixPrompt = (
  fileContents: string,
  suggestion: PRSuggestion
): ChatCompletionMessageParam[] => {
  const userMessage = INLINE_USER_MESSAGE_TEMPLATE.replace(
    "{SUGGESTION}",
    suggestion.toString()
  ).replace("{FILE}", assignFullLineNumers(fileContents));
  return [
    { role: "system", content: INLINE_FIX_PROMPT },
    { role: "user", content: userMessage },
  ];
};
