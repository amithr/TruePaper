import { LEGAL } from "@/lib/legal/constants";
import type { LegalDocumentContent } from "@/lib/legal/types";

const { appName, companyName, contactEmail, website, effectiveDate, jurisdiction, governingLaw } =
  LEGAL;

export const privacyPolicyEn: LegalDocumentContent = {
  title: "Privacy Policy",
  summary:
    "We collect only what we need to run live classroom sessions: teacher account details, student display names and answers, and technical logs. We use Supabase and Google for authentication and hosting. You can ask us to access, correct, or delete your data by emailing us.",
  sections: [
    {
      id: "who",
      title: "Who we are",
      paragraphs: [
        `${appName} (“we”, “us”) is operated by ${companyName}. This policy explains how we handle personal information when you use ${website} and related services.`,
        `Privacy questions: ${contactEmail}.`,
      ],
    },
    {
      id: "collect",
      title: "What we collect",
      paragraphs: [
        "Teachers (registered accounts): name, email address, password (stored in hashed form by our authentication provider), profile and role, forms and questions you create, live session metadata, and grading data.",
        "Students (typically without an account): a display name you provide, session join codes, written and multiple-choice responses, anonymous device identifiers used to save progress and support rejoin, and optional personal rejoin codes.",
        "Automatically: authentication cookies, locale preferences, server and security logs (IP address, browser type, timestamps), and error diagnostics needed to keep the service reliable.",
        "We do not intentionally collect payment card data through TruePaper today. If paid features are introduced, we will update this policy before charging you.",
      ],
    },
    {
      id: "purpose",
      title: "Why we use your data (lawful bases)",
      paragraphs: [
        "Contract: to provide accounts, forms, live sessions, autosave, live feedback, grading, and exports you request.",
        "Legitimate interests: to secure the platform, prevent abuse, improve reliability, and support teachers in running classes—balanced against your rights.",
        "Consent: where required for optional cookies or marketing communications you opt into.",
        "Legal obligation: when we must retain or disclose information to comply with law.",
      ],
    },
    {
      id: "sharing",
      title: "Third parties we use",
      paragraphs: [
        "Supabase — authentication, database, and file storage (processing may occur in the United States and other regions where Supabase operates).",
        "Google — optional “Sign in with Google” for teachers (Google’s privacy policy applies to that sign-in flow).",
        "Vercel — application hosting and content delivery.",
        "We do not sell your personal information. We do not share student answers with advertisers.",
      ],
    },
    {
      id: "retention",
      title: "How long we keep data",
      paragraphs: [
        "Teacher account data is kept while your account is active and for a reasonable period afterward so you can recover work or resolve disputes.",
        "Live session and student response data are kept according to your use of the product (including when you delete sessions from your dashboard) and our backup cycles.",
        "Server logs are rotated on a short schedule unless needed for security investigations.",
      ],
    },
    {
      id: "rights-gdpr",
      title: "Your rights (GDPR and similar laws)",
      paragraphs: [
        "Depending on where you live, you may have the right to access, correct, delete, restrict, or object to processing, and to data portability.",
        "You may withdraw consent where processing is consent-based (this does not affect prior lawful processing).",
        "EU/UK users may lodge a complaint with their local supervisory authority.",
        `To exercise rights, email ${contactEmail}. We respond within the timeframes required by applicable law.`,
        "Schools and districts acting as controllers may request a Data Processing Agreement (DPA) describing our subprocessors and security measures—contact us at the same address.",
      ],
    },
    {
      id: "rights-ccpa",
      title: "California privacy rights (CCPA/CPRA)",
      paragraphs: [
        "We do not sell or share personal information for cross-context behavioral advertising as defined under California law.",
        "California residents may request access, deletion, or correction, and may limit use of sensitive personal information where applicable.",
        "Do Not Sell or Share My Personal Information: we do not sell personal information. To confirm or submit a request, email " +
          contactEmail +
          ' with the subject line "California privacy request".',
      ],
    },
    {
      id: "children",
      title: "Children and schools",
      paragraphs: [
        "TruePaper is designed for classroom use under teacher direction. Teachers and schools are responsible for obtaining any parental or institutional consent required for student participation.",
        "Students should not enter more personal information than their teacher asks for (typically a first name or display name).",
      ],
    },
    {
      id: "security",
      title: "Security",
      paragraphs: [
        "We use industry-standard measures including encrypted connections (HTTPS), access controls, and row-level security in our database. No online service can guarantee absolute security.",
      ],
    },
    {
      id: "transfers",
      title: "International transfers",
      paragraphs: [
        "If you access TruePaper from outside the United States, your information may be processed in the U.S. and other countries where our providers operate. We rely on appropriate safeguards where required by law.",
      ],
    },
    {
      id: "changes",
      title: "Changes to this policy",
      paragraphs: [
        "We may update this policy from time to time. Material changes will be announced on this page and, where appropriate, by email to registered teachers at least 30 days before they take effect when practicable.",
        `Effective date: ${effectiveDate}. Last updated: ${effectiveDate}.`,
      ],
    },
  ],
};

export const termsOfServiceEn: LegalDocumentContent = {
  title: "Terms of Service",
  summary:
    "Teachers create accounts to run live exams; students join with a code. You keep ownership of your content; we need a license to host and display it. Use the service lawfully, don’t abuse it, and understand limits on our liability.",
  sections: [
    {
      id: "agreement",
      title: "Agreement",
      paragraphs: [
        `These Terms of Service (“Terms”) govern your use of ${appName} at ${website}, operated by ${companyName} (“we”, “us”). By creating an account or using the service, you agree to these Terms and our Privacy Policy.`,
        `Questions: ${contactEmail}. Effective date: ${effectiveDate}.`,
      ],
    },
    {
      id: "service",
      title: "The service",
      paragraphs: [
        "TruePaper lets teachers build forms, run timed live sessions, collect student responses in real time, provide feedback, and grade work. Students may participate with a session code without creating a full account.",
        "We may improve, change, or discontinue features with reasonable notice when changes materially affect paid or core functionality.",
      ],
    },
    {
      id: "accounts",
      title: "Accounts and eligibility",
      paragraphs: [
        "Teacher accounts require accurate registration information and a secure password. You are responsible for activity under your account.",
        "You must be old enough to enter a binding contract in your jurisdiction, or use the service with appropriate school authorization.",
      ],
    },
    {
      id: "content",
      title: "Your content and license",
      paragraphs: [
        "You retain ownership of forms, questions, feedback, and other material you upload or create (“Your Content”).",
        "You grant us a worldwide, non-exclusive license to host, store, reproduce, display, and process Your Content solely to operate, secure, and improve the service as you direct (including showing responses to you during live sessions).",
        "You represent that you have the rights to use Your Content and that student participation complies with applicable school policies and law.",
      ],
    },
    {
      id: "prohibited",
      title: "Prohibited uses",
      paragraphs: [
        "You may not: break the law; harass others; attempt unauthorized access; scrape or overload the service; reverse engineer except where permitted by law; upload malware; misrepresent identity; or use the service to store highly sensitive data categories (e.g. full medical records) without appropriate safeguards.",
        "We may suspend or terminate access for violations or risk to others.",
      ],
    },
    {
      id: "ip",
      title: "Our intellectual property",
      paragraphs: [
        "TruePaper’s software, branding, and documentation are owned by us or our licensors. These Terms do not grant you ownership of our platform—only the right to use it as described.",
      ],
    },
    {
      id: "disclaimer",
      title: "Disclaimers",
      paragraphs: [
        'THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT, TO THE MAXIMUM EXTENT PERMITTED BY LAW.',
        "We do not guarantee uninterrupted or error-free operation, or that exam anti-copy measures will prevent all cheating.",
      ],
    },
    {
      id: "liability",
      title: "Limitation of liability",
      paragraphs: [
        "TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE ARE NOT LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR LOST PROFITS OR DATA, ARISING FROM YOUR USE OF THE SERVICE.",
        "Our total liability for any claim relating to the service is limited to the greater of (a) amounts you paid us in the twelve months before the claim, or (b) one hundred U.S. dollars (US$100), except where law does not allow such limits.",
      ],
    },
    {
      id: "indemnity",
      title: "Indemnity",
      paragraphs: [
        "You will defend and indemnify us against claims arising from Your Content, your use of the service, or your violation of these Terms, except where caused by our gross negligence or willful misconduct.",
      ],
    },
    {
      id: "termination",
      title: "Termination",
      paragraphs: [
        "You may stop using the service at any time and may request account deletion via " + contactEmail + ".",
        "We may suspend or terminate your account for breach of these Terms or to protect the service. Upon termination, your license to use the platform ends; provisions that should survive (liability limits, indemnity, governing law) remain in effect.",
      ],
    },
    {
      id: "law",
      title: "Governing law and disputes",
      paragraphs: [
        `These Terms are governed by ${governingLaw}, without regard to conflict-of-law rules. Courts in ${jurisdiction} have exclusive jurisdiction, except where consumer protection law in your country requires otherwise.`,
        "If you are using the service on behalf of a school, you confirm you have authority to bind that institution.",
      ],
    },
    {
      id: "changes-terms",
      title: "Changes",
      paragraphs: [
        "We may update these Terms. Material changes will be posted on this page and, where appropriate, emailed to registered teachers before they take effect when practicable.",
      ],
    },
  ],
};

export const cookiePolicyEn: LegalDocumentContent = {
  title: "Cookie Policy",
  summary:
    "We use essential cookies to keep you signed in and remember your language. We do not use advertising cookies today. You can accept or reject optional analytics and marketing cookies in the banner—currently we do not load non-essential trackers even if you accept.",
  sections: [
    {
      id: "what",
      title: "What are cookies?",
      paragraphs: [
        "Cookies are small text files stored on your device. Similar technologies (such as local storage for cookie preferences) may be used for the same purposes described here.",
      ],
    },
    {
      id: "essential",
      title: "Essential cookies (always on)",
      paragraphs: [
        "Authentication (Supabase): keeps teacher sessions secure; session duration varies; provider: Supabase.",
        "Locale preference: remembers English or Ukrainian; up to 1 year; provider: TruePaper.",
        "Cookie consent record: remembers your banner choice; stored in local storage; provider: TruePaper.",
        "These cannot be turned off while using the service because the site would not function correctly.",
      ],
    },
    {
      id: "analytics",
      title: "Analytics cookies (optional)",
      paragraphs: [
        "Purpose: understand how the product is used so we can improve it.",
        "Status today: we do not deploy third-party analytics scripts (such as Google Analytics). If we enable them in the future, they will only run if you opt in through the cookie banner.",
        "Typical duration when enabled: up to 13 months (will be listed before activation).",
      ],
    },
    {
      id: "marketing",
      title: "Marketing cookies (optional)",
      paragraphs: [
        "Purpose: measure advertising or show relevant promotions.",
        "Status today: we do not use marketing or advertising cookies.",
        "If introduced later, they will only run with your opt-in consent.",
      ],
    },
    {
      id: "manage",
      title: "How to manage preferences",
      paragraphs: [
        "Use the cookie banner (“Accept All”, “Reject Non-Essential”, or “Manage Preferences”) when you first visit.",
        "To change your choice later, clear site data for truepaper.school or contact us—we will add an in-app preference link in a future update.",
        "You can also control cookies through your browser settings; blocking essential cookies may prevent sign-in.",
      ],
    },
    {
      id: "contact-cookies",
      title: "Contact",
      paragraphs: [
        `Questions about cookies: ${contactEmail}. See also our Privacy Policy.`,
        `Effective date: ${effectiveDate}.`,
      ],
    },
  ],
};
