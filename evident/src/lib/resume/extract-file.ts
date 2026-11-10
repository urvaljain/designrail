/** Turn an uploaded resume file into text. Never throws: a file that cannot be read yields an error message. */
export const MAX_RESUME_BYTES = 3 * 1024 * 1024;

export async function extractResumeText(file: { name: string; bytes: Uint8Array }): Promise<{ text: string; error?: string }> {
  if (file.bytes.byteLength === 0) return { text: "", error: "The file is empty." };
  if (file.bytes.byteLength > MAX_RESUME_BYTES) return { text: "", error: "The file is larger than 3 MB. Export a smaller PDF or paste the text." };
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  const head = Buffer.from(file.bytes.slice(0, 5)).toString("latin1");
  try {
    if (ext === "pdf" || head.startsWith("%PDF")) {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(file.bytes));
      const { text } = await extractText(pdf, { mergePages: false });
      const joined = (Array.isArray(text) ? text.join("\n") : String(text)).trim();
      if (!joined) return { text: "", error: "No text could be read from this PDF. It may be a scanned image. Export a text-based PDF or paste the text." };
      return { text: joined };
    }
    if (ext === "docx" || head.startsWith("PK")) {
      const mammoth = await import("mammoth");
      const res = await mammoth.extractRawText({ buffer: Buffer.from(file.bytes) });
      if (!res.value.trim()) return { text: "", error: "No text could be read from this document." };
      return { text: res.value };
    }
    if (ext === "txt" || ext === "md" || ext === "") {
      const text = new TextDecoder("utf-8", { fatal: false }).decode(file.bytes);
      return { text };
    }
    return { text: "", error: "Unsupported file type. Upload a PDF, DOCX or TXT file, or paste the text." };
  } catch {
    return { text: "", error: "This file could not be read. It may be corrupted or password-protected. Paste the text instead." };
  }
}
