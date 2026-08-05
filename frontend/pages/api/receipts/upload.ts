import type { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'fs';
import { parseReceiptImage } from '../../../lib/ai_parse_fixed';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const form = new formidable.IncomingForm({ multiples: false });

  form.parse(req, async (err: any, fields: any, files: any) => {
    if (err) {
      console.error('formidable error', err);
      return res.status(500).json({ error: 'Failed to parse upload' });
    }

    const file = files?.file as any | undefined;
    if (!file) return res.status(400).json({ error: 'No file uploaded (name: file)' });

    try {
      const buffer = fs.readFileSync(file.filepath);
      const contentType = file.mimetype || 'image/jpeg';
      const parsed = await parseReceiptImage(buffer, contentType);
      return res.status(200).json(parsed);
    } catch (e: any) {
      console.error('parse error', e);
      return res.status(500).json({ error: e?.message ?? String(e) });
    }
  });
}
