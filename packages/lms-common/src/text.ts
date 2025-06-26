/**
 * A cache for avoiding recompiling the same template strings.
 *
 * The cached value is a string with 2N + 1 elements, where N is the number of variables in the
 * template.
 */
const compiledTemplatesCache = new WeakMap<TemplateStringsArray, Array<string>>();

/**
 * The allowed types for the values in the `text` tag function.
 *
 * @public
 */
export type TextAllowedTypes = string | number | object;

/**
 * A string literal tag function that does the following:
 *
 * - Removes leading new lines
 * - Removes trailing new lines and whitespace
 * - Removes common indentation from the start of each line (Empty lines are ignored)
 * - Single newlines are replaced with a space + extra whitespace is removed
 *
 * Note: Only spaces are considered.
 *
 * @remarks
 *
 * The exact implementation of this function is not guaranteed to be the same, as we may add
 * additional edge case handling in the future. However, the general behavior should remain the
 * same.
 *
 * @public
 */
export function text(strings: TemplateStringsArray, ...values: ReadonlyArray<TextAllowedTypes>) {
  if (values.length + 1 !== strings.length) {
    throw new Error("text called with the wrong number of arguments.");
  }
  let compiled = compiledTemplatesCache.get(strings);
  if (compiled === undefined) {
    compiled = compile(strings);
    compiledTemplatesCache.set(strings, compiled);
  }

  // We can modify the array in place because JavaScript is single-threaded and the array is not
  // being accessed by any other code.
  for (let i = 0; i < values.length; i++) {
    if (typeof values[i] === "object") {
      if (typeof (values[i] as any).stack === "string") {
        compiled[i * 2 + 1] = (values[i] as any).stack;
      } else {
        try {
          compiled[i * 2 + 1] = JSON.stringify(values[i]);
        } catch (error) {
          compiled[i * 2 + 1] = "[Object failed to stringify]";
        }
      }
    } else {
      compiled[i * 2 + 1] = String(values[i]);
    }
  }

  return compiled.join("");
}

function removeLeadingNewlines(input: string) {
  return input.replace(/^\n+/, "");
}

function removeTrailingNewlinesAndWhitespace(input: string) {
  return input.replace(/[\n ]+$/, "");
}

function removeLeadingWhitespace(input: string) {
  return input.replace(/^ +/, "");
}

function removeTrailingWhitespace(input: string) {
  return input.replace(/ +$/, "");
}

function breakIntoLines(strings: Array<string>) {
  const lines: Array<Array<string>> = [];
  let currentLine: Array<string> = [];
  for (const string of strings) {
    let prevNewlineIndex = -1;
    let nextNewlineIndex;
    while ((nextNewlineIndex = string.indexOf("\n", prevNewlineIndex + 1)) !== -1) {
      currentLine.push(string.substring(prevNewlineIndex + 1, nextNewlineIndex));
      lines.push(currentLine);
      currentLine = [];
      prevNewlineIndex = nextNewlineIndex;
    }
    currentLine.push(string.substring(prevNewlineIndex + 1));
  }
  lines.push(currentLine);
  return lines;
}

/**
 * Returns the number of spaces at the start of the string. If the string only contains spaces,
 * returns infinity.
 */
function countStringIndentations(string: string) {
  let count = 0;
  for (const char of string) {
    if (char === " ") {
      count++;
    } else {
      return count;
    }
  }
  return Infinity;
}

function countLineIndentations(line: Array<string>) {
  const firstPart = line[0];
  const firstPartIndentation = countStringIndentations(firstPart);
  if (firstPartIndentation === Infinity) {
    if (line.length === 1) {
      return Infinity;
    } else {
      // If there is a variable after it, the length of indentation is the same as the length of the
      // first part.
      return firstPart.length;
    }
  }
  return firstPartIndentation;
}

function findMaxCommonIndentation(lines: Array<Array<string>>) {
  let minIndentation = Infinity;
  for (const line of lines) {
    minIndentation = Math.min(minIndentation, countLineIndentations(line));
  }
  return minIndentation;
}

function removeIndentation(line: string, indentation: number) {
  if (line.length < indentation) {
    return "";
  }
  return line.slice(indentation);
}

function removeAllIndentation(lines: Array<Array<string>>, indentation: number) {
  for (const line of lines) {
    line[0] = removeIndentation(line[0], indentation);
  }
}

function isEmptyLine(line: Array<string>) {
  if (line.length !== 1) {
    return false;
  }
  for (const char of line[0]) {
    if (char !== " ") {
      return false;
    }
  }
  return true;
}

function mergeLines(lines: Array<Array<string>>) {
  const linesAreEmpty = lines.map(isEmptyLine);
  const paragraphs: Array<Array<string>> = [];

  let currentParagraph: Array<string> = [];

  for (let i = 0; i < lines.length; i++) {
    if (linesAreEmpty[i]) {
      if (currentParagraph.length !== 0) {
        paragraphs.push(currentParagraph);
        currentParagraph = [];
      }
      continue;
    }
    if (currentParagraph.length !== 0) {
      const last = removeTrailingWhitespace(currentParagraph[currentParagraph.length - 1]);
      const next = removeLeadingWhitespace(lines[i][0]);
      currentParagraph[currentParagraph.length - 1] = last + " " + next;
      currentParagraph.push(...lines[i].slice(1));
    } else {
      currentParagraph.push(...lines[i]);
    }
  }

  if (currentParagraph.length !== 0) {
    paragraphs.push(currentParagraph);
  }

  return paragraphs;
}

function mergeParagraphs(paragraphs: Array<Array<string>>) {
  const result: Array<string> = [];
  if (paragraphs.length === 0) {
    return [""];
  }
  result.push(...paragraphs[0]);
  for (let i = 1; i < paragraphs.length; i++) {
    result[result.length - 1] += "\n\n" + paragraphs[i][0];
    result.push(...paragraphs[i].slice(1));
  }
  return result;
}

function addHolesForVariables(strings: Array<string>) {
  const result: Array<string> = [];
  for (let i = 0; i < strings.length; i++) {
    result.push(strings[i]);
    if (i < strings.length - 1) {
      result.push("");
    }
  }
  return result;
}

function compile(readonlyStrings: TemplateStringsArray): Array<string> {
  const strings = [...readonlyStrings];
  strings[0] = removeLeadingNewlines(strings[0]);
  strings[strings.length - 1] = removeTrailingNewlinesAndWhitespace(strings[strings.length - 1]);

  const lines = breakIntoLines(strings);
  const commonIndentation = findMaxCommonIndentation(lines);
  removeAllIndentation(lines, commonIndentation);
  const paragraphs = mergeLines(lines);
  return addHolesForVariables(mergeParagraphs(paragraphs));
}
