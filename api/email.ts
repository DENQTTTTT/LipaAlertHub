// api/email.ts
import { Resend } from "resend";

// ✅ Create client with your API key from Vercel environment variables
const resend = new Resend(process.env.RESEND_API_KEY || "");

// ✅ Vercel API handler
export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { type, email, otp } = req.body as {
      type: "otp" | "passwordChanged";
      email: string;
      otp?: string;
    };

    // Validation
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    let result;

    // 🔹 OTP Email
    if (type === "otp") {
      if (!otp) {
        return res.status(400).json({ error: "OTP is required for type=otp" });
      }

      result = await resend.emails.send({
        from: "LipaAlertHub <noreply@lipaalerthub.com>", // ⚠️ Make sure domain is verified in Resend
        to: [email],
        subject: "Your OTP Code",
        html: `<h1>Password Reset</h1><p>Your code is <b>${otp}</b></p>`,
      });
    }

    // 🔹 Password Changed Email
    else if (type === "passwordChanged") {
      result = await resend.emails.send({
        from: "LipaAlertHub <noreply@lipaalerthub.com>", // ⚠️ Replace with verified email
        to: [email],
        subject: "Password Changed",
        html: `<p>Your password was successfully updated. If this wasn’t you, please contact support immediately.</p>`,
      });
    }

    // Invalid type
    else {
      return res.status(400).json({ error: "Invalid email type" });
    }

    return res.status(200).json({ success: true, result });
  } catch (error: any) {
    console.error("Email send failed:", error);
    return res
      .status(500)
      .json({ error: error.message || "Internal Server Error" });
  }
}
