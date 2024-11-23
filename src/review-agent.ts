import { Octokit } from "@octokit/rest";
import { WebhookEventMap } from "@octokit/webhooks-definitions/schema";
import { ChatCompletionMessageParam } from "groq-sdk/resources/chat/completions";
import * as xml2js from "xml2js";
import type {
  BranchDetails,
  BuilderResponse,
  Builders,
  CodeSuggestion,
  PRFile,
  PRSuggestion,
} from "./constants";
import { PRSuggestionImpl } from "./data/PRSuggestionImpl";
import { generateChatCompletion } from "./llms/chat";
import {
  PR_SUGGESTION_TEMPLATE,
  buildPatchPrompt,
  constructPrompt,
  getReviewPrompt,
  getTokenLength,
  getXMLReviewPrompt,
  isConversationWithinLimit,
} from "./prompts";
import {
  INLINE_FIX_FUNCTION,
  getInlineFixPrompt,
} from "./prompts/inline-prompt";
import { getGitFile } from "./reviews";
import { parsePatch } from "diff";

export const reviewDiff = async (messages: ChatCompletionMessageParam[]) => {
  const message = await generateChatCompletion({
    messages,
  });
  return message.content;
};

export const reviewFiles = async (
  files: PRFile[],
  patchBuilder: (file: PRFile) => Promise<string>,
  convoBuilder: (diff: string) => ChatCompletionMessageParam[]
) => {
  console.log("Processing files:", files.map(f => f.filename));
  
  const patches = await Promise.all(files.map(async (file) => {
    const patch = await patchBuilder(file);
    console.log(`Patch for ${file.filename}:`, patch || 'EMPTY');
    if (!patch) {
      console.warn(`Empty patch generated for file: ${file.filename}`);
    }
    return patch;
  }));

  const validPatches = patches.filter(Boolean);
  if (validPatches.length === 0) {
    console.error("No valid patches generated");
    return "No changes to review";
  }

  console.log("Valid patches count:", validPatches.length);
  const messages = convoBuilder(validPatches.join("\n"));
  const feedback = await reviewDiff(messages);
  return feedback;
};

const filterFile = (file: PRFile) => {
  const extensionsToIgnore = new Set<string>([
    "pdf",
    "png",
    "jpg",
    "jpeg",
    "gif",
    "mp4",
    "mp3",
    "md",
    "json",
    "env",
    "toml",
    "svg",
  ]);
  const filesToIgnore = new Set<string>([
    "package-lock.json",
    "yarn.lock",
    ".gitignore",
    "package.json",
    "tsconfig.json",
    "poetry.lock",
    "readme.md",
  ]);
  const filename = file.filename.toLowerCase().split("/").pop();
  if (filename && filesToIgnore.has(filename)) {
    console.log(`Filtering out ignored file: ${file.filename}`);
    return false;
  }
  const splitFilename = file.filename.toLowerCase().split(".");
  if (splitFilename.length <= 1) {
    console.log(`Filtering out file with no extension: ${file.filename}`);
    return false;
  }
  const extension = splitFilename.pop()?.toLowerCase();
  if (extension && extensionsToIgnore.has(extension)) {
    console.log(`Filtering out file with ignored extension: ${file.filename} (.${extension})`);
    return false;
  }
  return true;
};

const groupFilesByExtension = (files: PRFile[]): Map<string, PRFile[]> => {
  const filesByExtension: Map<string, PRFile[]> = new Map();

  files.forEach((file) => {
    const extension = file.filename.split(".").pop()?.toLowerCase();
    if (extension) {
      if (!filesByExtension.has(extension)) {
        filesByExtension.set(extension, []);
      }
      filesByExtension.get(extension)?.push(file);
    }
  });

  return filesByExtension;
};

// all of the files here can be processed with the prompt at minimum
const processWithinLimitFiles = async (
  files: PRFile[],
  patchBuilder: (file: PRFile) => Promise<string>,
  convoBuilder: (diff: string) => ChatCompletionMessageParam[]
) => {
  const processGroups: PRFile[][] = [];
  const patches = await Promise.all(files.map(patchBuilder));
  const convoWithinModelLimit = isConversationWithinLimit(
    await constructPrompt(files, (f) => Promise.resolve(patches[files.indexOf(f)]), convoBuilder)
  );

  console.log(`Within model token limits: ${convoWithinModelLimit}`);
  if (!convoWithinModelLimit) {
    const grouped = groupFilesByExtension(files);
    for (const [extension, filesForExt] of grouped.entries()) {
      const extPatches = await Promise.all(filesForExt.map(patchBuilder));
      const extGroupWithinModelLimit = isConversationWithinLimit(
        await constructPrompt(filesForExt, (f) => Promise.resolve(extPatches[filesForExt.indexOf(f)]), convoBuilder)
      );
      if (extGroupWithinModelLimit) {
        processGroups.push(filesForExt);
      } else {
        // extension group exceeds model limit
        console.log(
          "Processing files per extension that exceed model limit ..."
        );
        let currentGroup: PRFile[] = [];
        filesForExt.sort((a, b) => a.patchTokenLength - b.patchTokenLength);
        for (const file of filesForExt) {
          const patch = await patchBuilder(file);
          const isPotentialGroupWithinLimit = isConversationWithinLimit(
            await constructPrompt([...currentGroup, file], (f) => Promise.resolve(f === file ? patch : patches[files.indexOf(f)]), convoBuilder)
          );
          if (isPotentialGroupWithinLimit) {
            currentGroup.push(file);
          } else {
            processGroups.push(currentGroup);
            currentGroup = [file];
          }
        }
        if (currentGroup.length > 0) {
          processGroups.push(currentGroup);
        }
      }
    }
  } else {
    processGroups.push(files);
  }
  return processGroups;
};

const stripRemovedLines = (originalFile: PRFile) => {
  // remove lines starting with a '-'
  const originalPatch = String.raw`${originalFile.patch}`;
  const strippedPatch = originalPatch
    .split("\n")
    .filter((line) => !line.startsWith("-"))
    .join("\n");
  return { ...originalFile, patch: strippedPatch };
};

const processOutsideLimitFiles = async (
  files: PRFile[],
  patchBuilder: (file: PRFile) => Promise<string>,
  convoBuilder: (diff: string) => ChatCompletionMessageParam[]
) => {
  const processGroups: PRFile[][] = [];
  if (files.length == 0) {
    return processGroups;
  }
  files = files.map((file) => stripRemovedLines(file));
  const convoWithinModelLimit = isConversationWithinLimit(
    await constructPrompt(files, patchBuilder, convoBuilder)
  );
  if (convoWithinModelLimit) {
    processGroups.push(files);
  } else {
    const exceedingLimits: PRFile[] = [];
    const withinLimits: PRFile[] = [];
    files.forEach(async (file) => {
      const isFileConvoWithinLimits = isConversationWithinLimit(
        await constructPrompt([file], patchBuilder, convoBuilder)
      );
      if (isFileConvoWithinLimits) {
        withinLimits.push(file);
      } else {
        exceedingLimits.push(file);
      }
    });
    const withinLimitsGroup = await processWithinLimitFiles(
      withinLimits,
      patchBuilder,
      convoBuilder
    );
    withinLimitsGroup.forEach((group) => {
      processGroups.push(group);
    });
    if (exceedingLimits.length > 0) {
      console.log("TODO: Need to further chunk large file changes.");
      // throw "Unimplemented"
    }
  }
  return processGroups;
};

const processXMLSuggestions = async (feedbacks: string[]) => {
  const xmlParser = new xml2js.Parser();
  const parsedSuggestions = await Promise.all(
    feedbacks.map((fb) => {
      fb = fb
        .split("<code>")
        .join("<code><![CDATA[")
        .split("</code>")
        .join("]]></code>");
      console.log(fb);
      return xmlParser.parseStringPromise(fb);
    })
  );
  // gets suggestion arrays [[suggestion], [suggestion]], then flattens
  const allSuggestions = parsedSuggestions
    .map((sug) => sug.review.suggestion)
    .flat(1);
  const suggestions: PRSuggestion[] = allSuggestions.map((rawSuggestion) => {
    const lines = rawSuggestion.code[0].trim().split("\n");
    lines[0] = lines[0].trim();
    lines[lines.length - 1] = lines[lines.length - 1].trim();
    const code = lines.join("\n");

    return new PRSuggestionImpl(
      rawSuggestion.describe[0],
      rawSuggestion.type[0],
      rawSuggestion.comment[0],
      code,
      rawSuggestion.filename[0]
    );
  });
  return suggestions;
};

const generateGithubIssueUrl = (
  owner: string,
  repoName: string,
  title: string,
  body: string,
  codeblock?: string
) => {
  const encodedTitle = encodeURIComponent(title);
  const encodedBody = encodeURIComponent(body);
  const encodedCodeBlock = codeblock
    ? encodeURIComponent(`\n${codeblock}\n`)
    : "";

  let url = `https://github.com/${owner}/${repoName}/issues/new?title=${encodedTitle}&body=${encodedBody}${encodedCodeBlock}`;

  if (url.length > 2048) {
    url = `https://github.com/${owner}/${repoName}/issues/new?title=${encodedTitle}&body=${encodedBody}`;
  }
  return `[Create Issue](${url})`;
};

export const dedupSuggestions = (
  suggestions: PRSuggestion[]
): PRSuggestion[] => {
  const suggestionsMap = new Map<string, PRSuggestion>();
  suggestions.forEach((suggestion) => {
    suggestionsMap.set(suggestion.identity(), suggestion);
  });
  return Array.from(suggestionsMap.values());
};

const convertPRSuggestionToComment = (
  owner: string,
  repo: string,
  suggestions: PRSuggestion[]
): string[] => {
  const suggestionsMap = new Map<string, PRSuggestion[]>();
  suggestions.forEach((suggestion) => {
    if (!suggestionsMap.has(suggestion.filename)) {
      suggestionsMap.set(suggestion.filename, []);
    }
    suggestionsMap.get(suggestion.filename).push(suggestion);
  });
  const comments: string[] = [];
  for (let [filename, suggestions] of suggestionsMap) {
    const temp = [`## ${filename}\n`];
    suggestions.forEach((suggestion: PRSuggestion) => {
      const issueLink = generateGithubIssueUrl(
        owner,
        repo,
        suggestion.describe,
        suggestion.comment,
        suggestion.code
      );
      temp.push(
        PR_SUGGESTION_TEMPLATE.replace("{COMMENT}", suggestion.comment)
          .replace("{CODE}", suggestion.code)
          .replace("{ISSUE_LINK}", issueLink)
      );
    });
    comments.push(temp.join("\n"));
  }
  return comments;
};

const xmlResponseBuilder = async (
  owner: string,
  repoName: string,
  feedbacks: string[]
): Promise<BuilderResponse> => {
  console.log("IN XML RESPONSE BUILDER");
  const parsedXMLSuggestions = await processXMLSuggestions(feedbacks);
  const comments = convertPRSuggestionToComment(
    owner,
    repoName,
    dedupSuggestions(parsedXMLSuggestions)
  );
  const commentBlob = comments.join("\n");
  return { comment: commentBlob, structuredComments: parsedXMLSuggestions };
};

const curriedXmlResponseBuilder = (owner: string, repoName: string) => {
  return (feedbacks: string[]) =>
    xmlResponseBuilder(owner, repoName, feedbacks);
};

const basicResponseBuilder = async (
  feedbacks: string[]
): Promise<BuilderResponse> => {
  console.log("IN BASIC RESPONSE BUILDER");
  const commentBlob = feedbacks.join("\n");
  return { comment: commentBlob, structuredComments: [] };
};

export const reviewChanges = async (
  files: PRFile[],
  convoBuilder: (diff: string) => ChatCompletionMessageParam[],
  responseBuilder: (responses: string[]) => Promise<BuilderResponse>
) => {
  console.log("Starting reviewChanges -----------------------------------------");
  const patchBuilder = async (file: PRFile) => await buildPatchPrompt(file);

  console.log("Initial files:", {
    count: files.length,
    files: files.map(f => ({
      filename: f.filename,
      status: f.status,
      hasPath: !!f.patch
    }))
  });

  const filteredFiles = files.filter((file) => filterFile(file));
  console.log("After filtering:", {
    originalCount: files.length,
    filteredCount: filteredFiles.length,
    filtered: filteredFiles.map(f => f.filename)
  });

  // Log before token length calculation
  console.log("Starting token length calculation for files:", 
    filteredFiles.map(f => f.filename)
  );

  await Promise.all(filteredFiles.map(async (file) => {
    const patch = await patchBuilder(file);
    file.patchTokenLength = getTokenLength(patch);
    console.log(`Token length for ${file.filename}: ${file.patchTokenLength}`);
  }));

  // Log before model limit separation
  console.log("Starting model limit separation");

  const patchesWithinModelLimit: PRFile[] = [];
  const patchesOutsideModelLimit: PRFile[] = [];

  // Change forEach to for...of for proper async handling
  for (const file of filteredFiles) {
    const patch = await buildPatchPrompt(file);
    const patchWithPromptWithinLimit = isConversationWithinLimit(
      await constructPrompt([file], () => Promise.resolve(patch), convoBuilder)
    );
    
    console.log(`File ${file.filename} within limit: ${patchWithPromptWithinLimit}`);
    
    if (patchWithPromptWithinLimit) {
      patchesWithinModelLimit.push(file);
    } else {
      patchesOutsideModelLimit.push(file);
    }
  }

  console.log("Final separation results:", {
    withinLimit: patchesWithinModelLimit.length,
    outsideLimit: patchesOutsideModelLimit.length
  });

  console.log(`files within limits: ${patchesWithinModelLimit.length}`);
  const withinLimitsPatchGroups = await processWithinLimitFiles(
    patchesWithinModelLimit,
    patchBuilder,
    convoBuilder
  );
  const exceedingLimitsPatchGroups = await processOutsideLimitFiles(
    patchesOutsideModelLimit,
    patchBuilder,
    convoBuilder
  );
  console.log(`${withinLimitsPatchGroups.length} within limits groups.`);
  console.log(
    `${patchesOutsideModelLimit.length} files outside limit, skipping them.`
  );
  
  const groups = [...withinLimitsPatchGroups, ...exceedingLimitsPatchGroups];

  const feedbacks = await Promise.all(
    groups.map((patchGroup) => {
      return reviewFiles(patchGroup, patchBuilder, convoBuilder);
    })
  );
  try {
    return await responseBuilder(feedbacks);
  } catch (exc) {
    console.log("XML parsing error");
    console.log(exc);
    throw exc;
  }
};

const indentCodeFix = (
  file: string,
  code: string,
  lineStart: number
): string => {
  const fileLines = file.split("\n");
  const firstLine = fileLines[lineStart - 1];
  const codeLines = code.split("\n");
  const indentation = firstLine.match(/^(\s*)/)[0];
  const indentedCodeLines = codeLines.map((line) => indentation + line);
  return indentedCodeLines.join("\n");
};

const isCodeSuggestionNew = (
  contents: string,
  suggestion: CodeSuggestion
): boolean => {
  const fileLines = contents.split("\n");
  const targetLines = fileLines
    .slice(suggestion.line_start - 1, suggestion.line_end)
    .join("\n");
  if (targetLines.trim() == suggestion.correction.trim()) {
    // same as existing code.
    return false;
  }
  return true;
};

export const generateInlineComments = async (
  suggestion: PRSuggestion,
  file: PRFile
): Promise<CodeSuggestion> => {
  try {
    const messages = getInlineFixPrompt(file.current_contents, suggestion);
    const { function_call } = await generateChatCompletion({
      messages,
      functions: [INLINE_FIX_FUNCTION],
      function_call: { name: INLINE_FIX_FUNCTION.name },
    });
    if (!function_call) {
      throw new Error("No function call found");
    }
    const args = JSON.parse(function_call.arguments);
    
    // Parse the patch to get the hunks and extract the starting line number
    const patches = parsePatch(file.patch);
    if (patches.length === 0 || patches[0].hunks.length === 0) {
      return null;
    }
    
    const hunk = patches[0].hunks[0];
    const diffStart = hunk.newStart;
    
    // Adjust the suggestion line numbers to be relative to the diff
    const adjustedLineStart = diffStart + (args["lineStart"] % 1000); // Using modulo to keep within reasonable range
    const adjustedLineEnd = adjustedLineStart + (args["lineEnd"] - args["lineStart"]);
    
    // Verify these lines are actually in the changed portion
    const changedLines = hunk.lines
      .map((line, index) => ({ line, index: diffStart + index }))
      .filter(({ line }) => line.startsWith('+'));
    
    const isInChangedPortion = changedLines.some(
      ({ index }) => index >= adjustedLineStart && index <= adjustedLineEnd
    );
    
    if (!isInChangedPortion) {
      console.log(`Skipping comment for ${file.filename} - adjusted lines ${adjustedLineStart}-${adjustedLineEnd} not in changed portion`);
      return null;
    }

    const initialCode = String.raw`${args["code"]}`;
    const indentedCode = indentCodeFix(
      file.current_contents,
      initialCode,
      adjustedLineStart
    );
    
    const codeFix = {
      file: suggestion.filename,
      line_start: adjustedLineStart,
      line_end: adjustedLineEnd,
      correction: indentedCode,
      comment: args["comment"],
      diff_hunk: hunk.lines.join('\n')
    };

    if (isCodeSuggestionNew(file.current_contents, codeFix)) {
      return codeFix;
    }
    return null;
  } catch (exc) {
    console.log(exc);
    return null;
  }
};

const preprocessFile = async (
  octokit: Octokit,
  payload: WebhookEventMap["pull_request"],
  file: PRFile
) => {
  const { base, head } = payload.pull_request;
  const baseBranch: BranchDetails = {
    name: base.ref,
    sha: base.sha,
    url: payload.pull_request.url,
  };
  const currentBranch: BranchDetails = {
    name: head.ref,
    sha: head.sha,
    url: payload.pull_request.url,
  };
  // Handle scenario where file does not exist!!
  const [oldContents, currentContents] = await Promise.all([
    getGitFile(octokit, payload, baseBranch, file.filename),
    getGitFile(octokit, payload, currentBranch, file.filename),
  ]);

  if (oldContents.content != null) {
    file.old_contents = String.raw`${oldContents.content}`;
  } else {
    file.old_contents = null;
  }

  if (currentContents.content != null) {
    file.current_contents = String.raw`${currentContents.content}`;
  } else {
    file.current_contents = null;
  }
};

const reviewChangesRetry = async (files: PRFile[], builders: Builders[]) => {
  for (const { convoBuilder, responseBuilder } of builders) {
    try {
      console.log(`Trying with convoBuilder: ${convoBuilder.name}.`);
      return await reviewChanges(files, convoBuilder, responseBuilder);
    } catch (error) {
      console.log(
        `Error with convoBuilder: ${convoBuilder.name}, trying next one. Error: ${error}`
      );
    }
  }
  throw new Error("All convoBuilders failed.");
};

export const processPullRequest = async (
  octokit: Octokit,
  payload: WebhookEventMap["pull_request"],
  files: PRFile[],
  includeSuggestions = false
) => {
  console.dir({ files }, { depth: null });
  const filteredFiles = files.filter((file) => filterFile(file));
  console.dir({ filteredFiles }, { depth: null });
  if (filteredFiles.length == 0) {
    console.log("Nothing to comment on, all files were filtered out. The PR Agent does not support the following file types: pdf, png, jpg, jpeg, gif, mp4, mp3, md, json, env, toml, svg, package-lock.json, yarn.lock, .gitignore, package.json, tsconfig.json, poetry.lock, readme.md");
    return {
      review: null,
      suggestions: [],
    };
  }
  await Promise.all(
    filteredFiles.map((file) => {
      return preprocessFile(octokit, payload, file);
    })
  );
  const owner = payload.repository.owner.login;
  const repoName = payload.repository.name;
  const curriedXMLResponseBuilder = curriedXmlResponseBuilder(owner, repoName);
  if (includeSuggestions) {
    const reviewComments = await reviewChangesRetry(filteredFiles, [
      {
        convoBuilder: getXMLReviewPrompt,
        responseBuilder: curriedXMLResponseBuilder,
      },
      {
        convoBuilder: getReviewPrompt,
        responseBuilder: basicResponseBuilder,
      },
    ]);
    let inlineComments: CodeSuggestion[] = [];
    if (reviewComments.structuredComments.length > 0) {
      console.log("STARTING INLINE COMMENT PROCESSING");
      inlineComments = await Promise.all(
        reviewComments.structuredComments.map((suggestion) => {
          // find relevant file
          const file = files.find(
            (file) => file.filename === suggestion.filename
          );
          if (file == null) {
            return null;
          }
          return generateInlineComments(suggestion, file);
        })
      );
    }
    const filteredInlineComments = inlineComments.filter(
      (comment) => comment !== null
    );
    return {
      review: reviewComments,
      suggestions: filteredInlineComments,
    };
  } else {
    const [review] = await Promise.all([
      reviewChangesRetry(filteredFiles, [
        {
          convoBuilder: getXMLReviewPrompt,
          responseBuilder: curriedXMLResponseBuilder,
        },
        {
          convoBuilder: getReviewPrompt,
          responseBuilder: basicResponseBuilder,
        },
      ]),
    ]);

    return {
      review,
      suggestions: [],
    };
  }
};
