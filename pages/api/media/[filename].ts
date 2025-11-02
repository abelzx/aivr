import { NextApiRequest, NextApiResponse } from "next";
import { readFile, getFilePath, fileExists } from "../../../utils/storage";
import path from "path";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const { filename } = req.query;

  if (!filename || typeof filename !== "string") {
    return res.status(400).json({ message: "Missing filename" });
  }

  try {
    // Check if file exists
    if (!fileExists(filename)) {
      return res.status(404).json({ message: "File not found" });
    }

    // Read file
    const buffer = await readFile(filename);

    // Determine content type from file extension
    const ext = path.extname(filename).toLowerCase();
    const contentTypes: { [key: string]: string } = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".webp": "image/webp",
    };

    const contentType = contentTypes[ext] || "application/octet-stream";

    // Set headers
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=3600"); // Cache for 1 hour

    // Send file
    return res.status(200).send(buffer);
  } catch (error: any) {
    console.error("Error serving file:", error);
    return res.status(500).json({ message: "Error serving file", error: error.message });
  }
}

