import { NextApiRequest, NextApiResponse } from "next";
import sync from "../../utils/sync";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { id }: any = req.query;

  try {
    const data = await sync.get(id);
    if (!data) return res.status(404).json({ message: "No data found" });
    else return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}
