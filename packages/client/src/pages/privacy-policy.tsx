type PolicySection = {
  header: string;
  subheader: string;
  content: string | string[];
};

const PRIVACY_POLICY: PolicySection[] = [
  {
    header: "Privacy Policy",
    subheader: "Last Modified",
    content: "1st April, 2025",
  },
  {
    header: "Introduction",
    subheader: "Overview",
    content:
      "This Privacy Policy applies to Eliza Foundation OpCo Ltd and outlines how personal information is collected, used, and disclosed in connection with the Services provided by Auto.fun.",
  },
  {
    header: "Scope of Services",
    subheader: "Services Covered",
    content: [
      "Websites operated by Auto.fun and related healthcare services",
      "Email, text, and other communications",
      "Offline business interactions",
    ],
  },
  {
    header: "Information Collection",
    subheader: "Types of Information",
    content: [
      "Email address",
      "Contact information",
      "Name",
      "Mailing/home/billing/shipping addresses",
      "Telephone number",
      "Age and date of birth",
      "Sex",
      "Credit or debit card number",
      "Personal characteristics (e.g. gender, ethnicity, weight, etc.)",
      "User account information and related inferences",
      "Medical history, diagnoses, medications",
      "Uploaded videos, images, and photographs",
      "Any other volunteered information",
      "Browser and device type, IP address, OS",
      "Pages viewed and links clicked",
      "Session duration and referring URLs",
    ],
  },
  {
    header: "Information Collection",
    subheader: "How We Collect",
    content: [
      "Directly from users via forms, uploads, etc.",
      "Automatically through website or app usage",
      "Through third-party providers and social media",
      "Via cookies and tracking tools",
      "From browser/device metadata",
      "Through pixel tags and analytics tools",
      "Via device location data",
    ],
  },
  {
    header: "Use of Information",
    subheader: "Why We Use It",
    content: [
      "To provide and operate Services",
      "To personalize user experience",
      "To send relevant communications and updates",
      "To conduct research and improve offerings",
      "To send marketing messages (with opt-out option)",
      "To meet legal obligations",
      "For other purposes with user consent",
    ],
  },
  {
    header: "Sharing of Information",
    subheader: "Who We Share With",
    content: [
      "Company employees on a need-to-know basis",
      "Service providers and contractors",
      "Other users via public posts or content",
      "Third parties with your consent",
      "Government or legal authorities as required",
      "In case of business transfers (mergers, acquisitions)",
      "To protect rights, safety, or enforce terms",
      "As aggregate or de-identified data for research or marketing",
    ],
  },
  {
    header: "User Choices",
    subheader: "Managing Communications",
    content: [
      "Users can opt out of promotional emails",
      "Users can stop text messages by replying 'STOP'",
      "Non-marketing communications may still be sent",
    ],
  },
  {
    header: "User Rights",
    subheader: "Access and Correction",
    content: [
      "Users can request access to personal data",
      "Users may update information through their account",
      "Requests may be denied if legally required",
    ],
  },
  {
    header: "Advertising",
    subheader: "Online Ad Practices",
    content: [
      "Use of cookies, pixels, and device tracking for ads",
      "Cross-device recognition via third-party platforms",
    ],
  },
  {
    header: "Data Retention",
    subheader: "How Long We Keep It",
    content: [
      "As long as the user account is active",
      "After deactivation, data may be kept for legal or operational purposes",
    ],
  },
  {
    header: "Security",
    subheader: "How We Protect Data",
    content: [
      "Use of organizational, technical, and administrative measures",
      "No method is 100% secure; users should notify of any concerns",
    ],
  },
  {
    header: "Contact",
    subheader: "How to Reach Us",
    content:
      "If you have questions about the privacy aspects of our Services, please contact us at inquiries@elizaos.ai",
  },
];

const PrivacyPolicy = () => {
  return (
    <div className="flex flex-col flex-1 min-h-[100vh]">
      <div className="max-w-4xl mx-auto p-6 text-white">
        <div className="flex flex-col gap-4">
          {PRIVACY_POLICY.map((item, _) => (
            <div className="flex flex-col gap-4">
              <div className="text-3xl font-bold">{item.header}</div>
              <div className="text-xl font-medium">{item.subheader}</div>
              <div>
                {typeof item.content === "string"
                  ? item.content
                  : item.content.map((line, idx) => <li key={idx}>{line}</li>)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
