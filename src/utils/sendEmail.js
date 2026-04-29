import nodemailer from 'nodemailer';

const sendEmail = async (options) => {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const message = {
    from: `${process.env.FROM_NAME || 'ZK Vault'} <${process.env.FROM_EMAIL}>`,
    to: options.email,
    subject: options.subject,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f7f6; }
          .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.1); border: 1px solid #e0e0e0; }
          .header { background: linear-gradient(135deg, #1e293b 0%, #334155 100%); color: #ffffff; padding: 40px 20px; text-align: center; }
          .header h1 { margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.5px; }
          .content { padding: 40px 30px; }
          .footer { background: #f8fafc; color: #64748b; padding: 20px; text-align: center; font-size: 13px; border-top: 1px solid #e2e8f0; }
          .btn { display: inline-block; padding: 14px 28px; background: #3b82f6; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 25px 0; box-shadow: 0 4px 6px rgba(59, 130, 246, 0.2); transition: transform 0.2s; }
          .security-notice { background: #fffbeb; border-left: 4px solid #f59e0b; padding: 15px; margin-top: 25px; font-size: 13px; color: #92400e; border-radius: 4px; }
          .logo-icon { font-size: 40px; margin-bottom: 10px; display: block; }
          h2 { color: #1e293b; margin-top: 0; }
          p { margin-bottom: 15px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo-icon">🛡️</div>
            <h1>ZK Vault</h1>
          </div>
          <div class="content">
            ${options.message}
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} ZK Vault Security Team. All rights reserved.</p>
            <p>This is an automated security notification. Please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  };

  try {
    const info = await transporter.sendMail(message);
    console.log('Message sent: %s', info.messageId);
  } catch (error) {
    console.error('--- EMAIL SENDING FAILED ---');
    console.error('Error:', error.message);
    console.error('--- FALLBACK: EMAIL CONTENT ---');
    console.error('To:', options.email);
    console.error('Subject:', options.subject);
    console.log('HTML Body:', options.message);
    console.error('-------------------------------');
    throw error; // Still throw to show UI error, but developer can see the link in terminal
  }
};


export default sendEmail;
