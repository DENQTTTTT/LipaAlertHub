// api/email.ts
import { VercelRequest, VercelResponse } from "@vercel/node";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { type, email, otp } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  try {
    if (type === "otp") {
      const result = await resend.emails.send({
        from: "LipaAlertHub <noreply@lipaalerthub.com>",
        to: [email],
        subject: "Your OTP Code",
        html: `<h1>Password Reset</h1><p>Your code is <b>${otp}</b></p>`,
      });
      return res.status(200).json({ success: true, result });
    }

    if (type === "passwordChanged") {
      const result = await resend.emails.send({
        from: "LipaAlertHub <noreply@lipaalerthub.com>",
        to: [email],
        subject: "Password Changed",
        html: `<p>Your password was successfully updated. If this wasn’t you, please contact support immediately.</p>`,
      });
      return res.status(200).json({ success: true, result });
    }

    return res.status(400).json({ error: "Invalid email type" });
  } catch (error: any) {
    console.error("Email send failed:", error);
    return res.status(500).json({ error: error.message });
  }
}
