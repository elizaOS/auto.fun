type TermsSection = {
  header: string;
  subheader: string;
  content: string | string[];
};

const TERMS_AND_CONDITIONS: TermsSection[] = [
  {
    header: "Platform Terms & Conditions",
    subheader: "Last Updated",
    content: "31 January 2025",
  },
  {
    header: "General Notice",
    subheader: "Legal Agreement",
    content:
      "These terms are a legal agreement between you and Eliza Foundation OpCo Ltd governing use of the Auto.fun platform, offerings, and digital assets.",
  },
  {
    header: "Acceptance of Terms",
    subheader: "Binding Agreement",
    content: [
      "By using or accessing any part of the platform, you agree to be legally bound by these terms.",
      "If you do not agree, you must discontinue use of the platform.",
    ],
  },
  {
    header: "Changes",
    subheader: "Modifications",
    content: [
      "Terms may be updated at our discretion and posted to the site.",
      "Continued use constitutes acceptance of updated terms.",
    ],
  },
  {
    header: "Minimum Age",
    subheader: "Eligibility",
    content: [
      "Users must be at least 18 years old and legally capable of entering a binding contract.",
    ],
  },
  {
    header: "About Auto.Fun",
    subheader: "Platform Description",
    content: [
      "Auto.Fun is a multi-agent AI simulation framework offering autonomous services for entertainment and functionality.",
    ],
  },
  {
    header: "Information is Not Advice",
    subheader: "Disclaimer",
    content: [
      "Content on the platform is for entertainment or informational purposes only.",
      "It does not constitute financial, legal, or investment advice.",
    ],
  },
  {
    header: "No Affiliation with Andreessen Horowitz",
    subheader: "Clarification",
    content: [
      "Auto.fun is not affiliated with Andreessen Horowitz (a16z).",
      "References are for descriptive purposes only.",
    ],
  },
  {
    header: "Using the Platform",
    subheader: "License & Conditions",
    content: [
      "You are granted a limited, non-transferable license to use the platform for personal, non-commercial purposes.",
      "Certain features may require account registration and approval.",
      "You are responsible for securing your account and information.",
    ],
  },
  {
    header: "User Conduct",
    subheader: "Acceptable Use",
    content: [
      "You may not use the platform for unlawful purposes including fraud, money laundering, or harassment.",
      "Unauthorized access, spamming, or violation of intellectual property is prohibited.",
    ],
  },
  {
    header: "Fees and Payments",
    subheader: "Financial Terms",
    content: [
      "You agree to pay all applicable fees for platform use.",
      "Fees are non-refundable unless otherwise stated.",
      "Users are responsible for tax compliance.",
    ],
  },
  {
    header: "Electronic Communications",
    subheader: "Consent",
    content: [
      "You consent to receive electronic communications including texts and emails.",
      "These communications may include legal notices, billing, or service updates.",
    ],
  },
  {
    header: "Intellectual Property",
    subheader: "Ownership & Usage",
    content: [
      "All platform content is owned by Eliza Foundation OpCo Ltd or its licensors.",
      "You are not granted any ownership rights and must not misuse trademarks or materials.",
    ],
  },
  {
    header: "Assumption of Risk",
    subheader: "User Responsibility",
    content: [
      "Using the platform involves risks including blockchain volatility, hacking, and infrastructure failures.",
      "You assume all responsibility for key and asset management, and legal compliance.",
    ],
  },
  {
    header: "Disclaimer",
    subheader: "No Warranties",
    content: [
      "The platform is provided 'as-is' without warranties of any kind.",
      "We are not liable for third-party actions or blockchain-related losses.",
    ],
  },
  {
    header: "Limitation of Liability",
    subheader: "Damages Disclaimer",
    content: [
      "We are not liable for indirect, special, or consequential damages.",
      "We are not responsible for user mistakes, third-party issues, or force majeure events.",
    ],
  },
  {
    header: "Release and Indemnity",
    subheader: "Liability Waiver",
    content: [
      "You release and indemnify us from all claims related to platform use, misuse, or legal violations.",
      "California Civil Code §1542 waiver included.",
    ],
  },
  {
    header: "Termination",
    subheader: "Access Control",
    content: [
      "We may suspend or terminate your access for any reason without notice.",
      "Terms continue to apply after termination.",
    ],
  },
  {
    header: "Third Party Materials",
    subheader: "External Links",
    content: [
      "We are not responsible for third-party content or services accessed via the platform.",
      "You use such services at your own risk.",
    ],
  },
  {
    header: "Feedback",
    subheader: "Ownership of Suggestions",
    content: [
      "All feedback becomes our property for use without compensation or obligation to you.",
    ],
  },
  {
    header: "General",
    subheader: "Legal Provisions",
    content: [
      "These terms form the entire agreement and are governed by Cayman Islands law (except for US users).",
      "Invalid provisions do not affect the enforceability of the rest.",
    ],
  },
  {
    header: "Dispute Resolution",
    subheader: "Arbitration & Waivers (US Users)",
    content: [
      "All disputes will be resolved through binding arbitration.",
      "Class action and jury trial rights are waived.",
      "Mass arbitration processes and opt-out mechanisms apply.",
    ],
  },
  {
    header: "Regulatory Compliance",
    subheader: "US Law Adherence",
    content: [
      "Users must comply with US laws on sanctions, securities, AML/CFT, and taxation.",
      "Usage from sanctioned regions or for unlawful activities is prohibited.",
    ],
  },
  {
    header: "Taxation Responsibility",
    subheader: "User Obligation",
    content: [
      "You are responsible for reporting all income and capital gains from digital assets to the IRS or relevant authority.",
    ],
  },
  {
    header: "Governing Law & Arbitration",
    subheader: "Jurisdiction",
    content: [
      "For non-US users, these terms are governed by Cayman Islands law with binding arbitration in a location of our choice.",
    ],
  },
  {
    header: "Contact Us",
    subheader: "Support",
    content: "For questions or support, email us at inquiries@elizaos.ai",
  },
];

const TermsOfService = () => {
  return (
    <div className="flex flex-col flex-1 min-h-[100vh]">
      <div className="max-w-4xl mx-auto p-6 text-white">
        <div className="flex flex-col gap-4">
          {TERMS_AND_CONDITIONS.map((item, _) => (
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

export default TermsOfService;
