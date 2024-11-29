import { PRSuggestion } from "../constants";

export class PRSuggestionImpl implements PRSuggestion {
  describe: string;
  type: string;
  comment: string;
  code: string;
  filename: string;

  constructor(
    describe: string,
    type: string,
    comment: string,
    code: string,
    filename: string
  ) {
    this.describe = describe;
    this.type = type;
    this.comment = comment;
    this.code = code;
    this.filename = filename;
  }

  toString(): string {
    const xmlElements = [
      `<suggestion>`,
      `  <describe>${this.describe}</describe>`,
      `  <type>${this.type}</type>`,
      `  <comment>${this.comment}</comment>`,
      `  <code>${this.code}</code>`,
      `  <filename>${this.filename}</filename>`,
      `</suggestion>`,
    ];
    return xmlElements.join("\n");
  }

  identity(): string {
    return `${this.filename}:${this.comment}`;
  }
}