import { NextApiRequest, NextApiResponse } from "next";

import Jimp from "jimp";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { body } = req;
  try {
    const image_mask = await Jimp.read("https://sepia-loris-2302.twil.io/assets/twilio_mask.png");
    const image_target = await Jimp.read(
      "https://images-5674.twil.io/example.jpeg"
    );

    //image_target.mask(image_mask, 0, 0);

    image_target.blit(image_mask, 0, 0);

    image_target.getBuffer(Jimp.MIME_PNG, (err, buf) => {
      console.log("Got image");
      if (err) {
        console.log("Error getting image", err);
        return res.status(500).json({ message: "Error getting image" });
      } else {
        console.log("Returning masked image");
        res.setHeader("Content-Type", Jimp.MIME_PNG);
        res.status(200);
        return res.send(buf);
      }
    });
  } catch (error) {
    console.log("Error processing image mask", error);
    return res.status(500).json({ error });
  }
}
