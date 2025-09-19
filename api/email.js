// api/email.js
const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { to, subject, html, otp } = req.body;

    // ✅ Fallback: log OTP for testing (no email sending yet)
    console.log("⚡ OTP Email Log:", { to, subject, otp });

    // --- Uncomment this once your domain or sender is verified ---
    /*
    const data = await resend.emails.send({
      from: "alerts@lipaalerthub.com", // must be a verified sender/domain
      to,
      subject,
      html,
    });

    return res.status(200).json({ success: true, data });
    */

    // Temporary success response while only logging
    return res.status(200).json({
      success: true,
      message: "OTP logged (email not sent in dev mode)",
    });

  } catch (error) {
    console.error("Email API error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
