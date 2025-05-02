type PolicySection = {
  header?: string;
  subheader?: string;
  content: string | string[];
  subcontent?: string[];
};

const PRIVACY_POLICY: PolicySection[] = [
  {
    header: "Introduction",
    subheader: "Overview",
    content:
      'This Privacy Policy (this "Policy") applies to Eliza Foundation OpCo Ltd and the personal information we collect, use, and disclose in connection with your use of our Services (as defined below) and other business interactions you have with us. At Auto.fun (the "Company," "we," or "us"), we want you to be familiar with how we collect, use, and disclose personal information. This Privacy Policy describes our practices in connection with personal information that we collect through our "Services," which together, include:',
    subcontent: [
      'Websites operated by us, and any subsequent healthcare services you receive through the same (together, the "Platform");',
      "Email and text messages that we send to you or other communications with you; and",
      "Offline business interactions you have with us.",
    ],
  },
  {
    content: 'Please read this Policy carefully to understand our practices regarding your personal information and how we will treat it. This Policy may be updated from time to time and will be made available on our website. Your continued use of our Services is deemed to be acceptance to those updated terms so please check this Policy periodically for any updates. The last date modified above will tell you when changes were last made to this Policy.'
  },
  {
    header: "The Information We Collect About You",
    subheader: 'What types of personal information do we collect?',
    content: 'We collect different types of information about you, including information that may identify you, information about you that does not individually identify you, and information that we combine with information from other sources (aggregate data). We collect information about you directly from you, from third parties, and automatically through your use of an App, the Platform, or our Services.',
    subcontent: [
      "Email address",
      "Contact information",
      "Name",
      "Mailing and home address",
      "Billing address",
      "Shipping address",
      "Telephone number",
      "Age and date of birth",
      "Sex",
      "Credit or debit card number (for payment purposes)",
      "Personal characteristics (which may, among others, include gender, ethnicity/race, weight, height, preferences, predispositions, behavior and attitudes)",
      "User account information and inferences drawn from such information",
      "Medical history",
      "Other health information and associated diagnoses and medications",
      "Videos, images and photographs you share with us",
      "Information you upload onto an App or the Platform",
      "Any other information you volunteer directly or indirectly when contacting us including through or using the Platform or our Services",
    ],
  },
  {
    subheader: 'The Platform may automatically collect the following',
    content: [
      "Your browser and device type, IP address and operating system",
      "Web pages you view on the Platform; links you click on our website",
      "The length of time you visit our Platform and/or use our Services",
      "The referring URL, or the webpage that led you to our Platform",
    ],
  },
  {
    header: "How we collect personal information?",
    content: [
      "Personal information you share with us directly. We collect the personal information you provide to us, for example, when you create an account, use our Services, or communicate with us.",
      "Personal information we collect automatically. When you visit or use our Platform, we may gather, collect, and record personal information about such visits. We do this ourselves or with the help of third parties, including through the use of 'cookies' and other tracking technologies, as further detailed below.",
      "Personal information you direct us to receive, including personal information we receive from third parties and social media.** We may collaborate with third parties in connection with providing the Services and these third parties may provide us with personal information about you.",
      "Your browser or device.** Certain information is collected by most browsers or automatically through your device, such as your Media Access Control (MAC) address, computer type (Windows or Mac), screen resolution, operating system name and version, device manufacturer and model, language, Internet browser type and version and the name and version of the Services you are using.",
      "Your use of our website.** When you download and use the Platform, we and our service providers may track and collect Platform usage data, such as the date and time on your device or your use of the website accesses our servers and what information and files have been downloaded to the Platform based on your device number.",
      "Cookies: Cookies are pieces of information stored in the browser or on the device that you are using. Cookies allow the collection of personal information such as browser type, time spent on the Services, pages visited, language preferences, and other traffic data, which is used for security purposes, to facilitate navigation, to display information more effectively, and to personalize your experience including to send you advertising, and to measure and analyze such activities. We also gather statistical and other information about use of the Services in order to continually improve their design and functionality, understand how they are used, and assist us with resolving questions regarding them. You may also wish to refer to http://www.allaboutcookies.org/manage-cookies/index.html.",
      "Pixel tags and other similar technologies. Pixel tags (also known as web beacons and clear GIFs) may be used to, among other things, track the actions of users of the Services (including email recipients), measure the success of our marketing campaigns, and compile statistics about usage of the Services and response rates. We may use third party pixel tags on some websites.",
      "Analytics: We use data analytics providers that use cookies and similar technologies to collect and analyze personal information about use of the Services and report on activities and trends. The analytics service may also collect information regarding the use of other websites, apps, and online resources.",
      "Location: We may collect the general or precise location of your device by, for example, using satellite, cell phone tower or WiFi signals. We may use your device’s location to provide you with location-based services and content, and you can adjust the permissions on your device to allow or deny such uses and/or sharing of your device’s location.",
    ],
  },
  {
    header: "How we use the personal information we collect?",
    subheader: "We use your information, including your personal information, for the following purposes:",
    content: [
      "To provide the Services. This includes using your information to operate our services, communicate with you regarding your service usage, address your inquiries, and for general customer support. We also use your information to ensure the Platform's functionality, tailor content, offer location-based services, provide personalized assistance, share relevant information with your primary care provider, process transactions, and manage our contractual obligations, including billing and collections.",
      "To improve the Services. We analyze your information to enhance the operation of our Services, conduct market research, understand user interaction with our Platform, and improve overall user experience.",
      "For marketing. Where permitted by law, we may send you promotional materials and advertisements about our Services or new offerings that might interest you. We may also use cookies and similar technologies to track your online activity and show you relevant ads on other websites. You have the option to unsubscribe from marketing communications at any time. Please note that even if you opt out of marketing, we may still send you important non-marketing messages related to your account or services you've used.",
      "To meet our legal obligations. We use your information to comply with legal requirements, as part of our standard business operations, and for administrative purposes, such as responding to lawful requests for information like subpoenas.",
      "Other. We may use your personal information for any other purpose that we clearly describe when we collect the information or when we have your explicit consent.",
    ],
  },
  {
    header: "When and with whom we share your personal information?",
    subheader: "We may share your information, including personal information, as follows:",
    content: [
      "With employees of the Company. We disclose the information we collect from you to certain Company employees on a need-to-know basis to train them and to allow them to perform their job duties.",
      "With service providers. We disclose the information we collect from you to our service providers, contractors, and agents who perform functions on our behalf. These service providers may include, but are not limited to, providers, technology service vendors such as Amazon Web Services, Microsoft, Google, payment processors, and marketing or administrative service providers, including research partners.",
      "With Company Users. Information you post to our Platform, including, without limitation, reviews, comments, and text will be available to, and searchable by, all users of the Platform.",
      "With third parties. With your individual consent, we disclose the information we collect from you to specific third parties authorized by you.",
      "Other. We disclose information we collect from you to other persons, including government agencies, regulatory bodies, and law enforcement agencies as required, authorized or otherwise permitted by law.",
    ],  
  },
  {
    subheader: "We also disclose information in the following circumstances:",
    content: [
      "Business Transfers. If (i) we or our affiliates are or may be acquired by, merged with, or invested in by another company, or (ii) if any of our assets are or may be transferred to another company, whether as part of a bankruptcy or insolvency proceeding or otherwise, we may transfer the information we have collected from you to the other company. As part of the business transfer process, we may share certain of your personal information with lenders, auditors, and third party advisors, including attorneys and consultants.",
      "In Response to Legal Process. We disclose your information to comply with applicable law, judicial proceeding, court order, or other legal process, such as in response to a court order or a subpoena.",
      "To Protect Us and Others. We disclose your information when we believe it is appropriate to do so to investigate, prevent, or take action regarding illegal activities, suspected fraud, situations involving potential threats to the safety of any person, violations of our Terms and Conditions of Use or this Policy, or as evidence in litigation in which we are involved.",
      "Aggregate and De-Identified Information. We may share aggregate or de-identified information about users with third parties for marketing, advertising, our business purposes, research or similar purposes.",
      "We do not share, sell or otherwise disclose your personal information for purposes other than those outlined in this Policy, unless we have your consent to do so. "
    ],  
  },
  {
    header: "What Choices Do I Have Regarding Use of My Personal Information?",
    content: `We may send periodic informational emails to you. You may opt-out of promotional emails by following the unsubscribe instructions contained in the email or by contacting us at the details listed at the end of this Policy. Please note that it may take up to ten (10) business days for us to process unsubscribe requests. If you opt-out of receiving promotional emails, we may still send you emails about your account or any services you have requested or received from us
    As further set forth in the Terms and Conditions of Use, by providing your mobile phone number, you are agreeing to be contacted by or on behalf of the Company at the mobile number you have provided, including through telephone calls and text messages, to receive information, product or service-related messages and communications. Message and data rates may apply. To stop receiving text messages, reply to us with the word "STOP". We may confirm your opt out by text message. Please be aware that by withdrawing your consent, some Services may no longer be available to you. If you stop receiving text messages from us, you may not receive important and helpful information and reminders about your services.
    `,
    
  },
  {
    header: "Your Rights Regarding Your Information and Accessing and Correcting Your Information",
    content:
    "You may contact us to access or change your personal information that we have about you. You may also be able to review and change your personal information by logging into the Platform through your user account. You can contact us to access or find out what information we have about you and to ensure that the information we have about you is correct, complete and current. We may not be able to accommodate your request, for example, if we believe that it would violate any law or legal requirement or cause the information to be incorrect. If we are not able to accommodate your request, we will provide the reason why your information cannot be provided."
  },
  {
    header: "Information About Online Advertising",
    content: `
    We use third party advertising networks, data analytics providers, operating systems and platforms, and social networks to serve advertisements regarding goods and services that may be of interest to you. These companies place or recognize a unique cookie on your browser (including through the use of pixel tags). They also use these technologies, along with information they collect about your online and offline use, to recognize you across the devices you use, such as a mobile phone and laptop. `
  },
  {
    header: "Retention",
    content: `
    We will keep your personal information for as long as your user account is active, in order to allow you to have access to your information and to provide you with our services. We may continue to retain your personal information even after you deactivate your user account or stop using the Services, as reasonably necessary to comply with our legal obligations, to resolve disputes regarding our users, enforce our agreements or protect our legitimate interests, consistent with applicable law.`
  },
  {
    header: "Security",
    content: [
      "Use of organizational, technical, and administrative measures",
      "No method is 100% secure; users should notify of any concerns",
    ],
  },
  {
    header: "Contact",
    content: 'If you have questions about the privacy aspects of our Services, please contact us by email at inquires@elizaos.ai.'
  },
];

const PrivacyPolicy = () => {
  return (
    <div className="flex flex-col flex-1 min-h-[100vh]">
      <div className="max-w-4xl mx-auto p-12 text-white">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4">
            <h1 className="text-6xl font-bold">Privacy Policy</h1>
            <div className="text-xl font-medium">
              Last Modified April 1st, 2025
            </div>
          </div>
          {PRIVACY_POLICY.map((item, _) => (
            <div className="flex flex-col gap-4">
              <div className="text-3xl font-bold">{item.header}</div>
              <div className="text-xl font-medium">{item.subheader}</div>
              <div>
                {typeof item.content === "string"
                  ? item.content
                  : item.content.map((line, idx) => <li key={idx}>{line}</li>)}
              </div>
              {item.subcontent ? (
                <div>
                  {item.subcontent.map((line, idx) => (
                    <li key={idx}>{line}</li>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
