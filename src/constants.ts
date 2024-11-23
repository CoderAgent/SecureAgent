import { Node } from "@babel/traverse";
import { JavascriptParser } from "./context/language/javascript-parser";
import { ChatCompletionMessageParam } from "groq-sdk/resources/chat/completions";
import { PythonParser } from "./context/language/python-parser";
import { SyntaxNode } from "web-tree-sitter";

export interface PRFile {
  sha: string;
  filename: string;
  status:
    | "added"
    | "removed"
    | "renamed"
    | "changed"
    | "modified"
    | "copied"
    | "unchanged";
  additions: number;
  deletions: number;
  changes: number;
  blob_url: string;
  raw_url: string;
  contents_url: string;
  patch?: string;
  previous_filename?: string;
  patchTokenLength?: number;
  old_contents?: string;
  current_contents?: string;
}

export interface BuilderResponse {
  comment: string;
  structuredComments: any[];
}

export interface Builders {
  convoBuilder: (diff: string) => ChatCompletionMessageParam[];
  responseBuilder: (feedbacks: string[]) => Promise<BuilderResponse>;
}

export interface PatchInfo {
  hunks: {
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
    lines: string[];
  }[];
}

export interface PRSuggestion {
  describe: string;
  type: string;
  comment: string;
  code: string;
  filename: string;
  toString: () => string;
  identity: () => string;
}

export interface CodeSuggestion {
  file: string;
  line_start: number;
  line_end: number;
  correction: string;
  comment: string;
}

export interface ChatMessage {
  role: string;
  content: string;
}

export interface Review {
  review: BuilderResponse;
  suggestions: CodeSuggestion[];
}

export interface BranchDetails {
  name: string;
  sha: string;
  url: string;
}

export const sleep = async (ms: number) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

export const processGitFilepath = (filepath: string) => {
  // Remove the leading '/' if it exists
  return filepath.startsWith("/") ? filepath.slice(1) : filepath;
};

export interface EnclosingContext {
  enclosingContext: Node | SyntaxNode | null;
}

export interface AbstractParser {
  findEnclosingContext(
    file: string,
    lineStart: number,
    lineEnd: number
  ): Promise<EnclosingContext>;
  
  dryRun(
    file: string
  ): Promise<{ valid: boolean; error: string }>;
}

const EXTENSIONS_TO_PARSERS: Map<string, AbstractParser> = new Map([
  ["ts", new JavascriptParser()],
  ["tsx", new JavascriptParser()],
  ["js", new JavascriptParser()],
  ["jsx", new JavascriptParser()],
  ["py", new PythonParser()],
]);

export const getParserForExtension = (filename: string): AbstractParser => {
  console.log(`🔧 Getting parser for file: ${filename}`);
  const extension = filename.split('.').pop()?.toLowerCase();
  console.log(`Extension detected: ${extension}`);
  
  // Add logging for what parser is being returned
  const parser = EXTENSIONS_TO_PARSERS.get(extension);
  console.log(`Parser found: ${parser ? parser.constructor.name : 'None'}`);
  
  return parser;
};

export const assignLineNumbers = (contents: string): string => {
  const lines = contents.split("\n");
  let lineNumber = 1;
  const linesWithNumbers = lines.map((line) => {
    const numberedLine = `${lineNumber}: ${line}`;
    lineNumber++;
    return numberedLine;
  });
  return linesWithNumbers.join("\n");
};
