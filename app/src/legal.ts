/** Bump POLICY_VERSION whenever the policy text changes. Everyone is then asked to accept it again. */
export const POLICY_VERSION = '2026-10-05';

export const COMPANY = {
  product: 'CareReach',
  /** Name of the business that runs the service. Set it before you go live. */
  name: '',
  /** Where people can send privacy requests. Set it before you go live. */
  contactEmail: '',
};

export interface PolicySection {
  title: string;
  /** Lines starting with "- " are shown as bullets. */
  body: string[];
}

const op = COMPANY.name || COMPANY.product;

export const POLICY: PolicySection[] = [
  {
    title: '1. Who we are',
    body: [
      `${COMPANY.product} is a service that lets a business (for example a clinic or a shop) send WhatsApp messages to its own customers or patients from an uploaded sheet, see delivery reports, read replies, and optionally let an AI assistant answer simple questions.`,
      `In this policy "we" means ${op}, the operator of ${COMPANY.product}. "You" means the person or business that creates an account. "Your contacts" means the patients or customers whose details you upload.`,
    ],
  },
  {
    title: '2. What we collect',
    body: [
      '- Account data: your name, email address and sign-in method (email and password, or Google). We never see or store your Google password. Email passwords are handled by Firebase Authentication.',
      '- Contact data you upload: phone numbers, names, doctor or other columns from your sheet.',
      '- Message data: the text of messages sent to and received from your contacts, their delivery status (sent, delivered, read, failed), time, and any error code.',
      '- Settings you save: column choices, the template you picked, sending speed and Agent mode on or off.',
      '- Secrets you provide: your WhatsApp access token and your AI provider key. They are stored on our server side only and are never sent back to the app or shown again.',
      '- Technical data: sign-in and security logs and basic request information (such as IP address) kept by our hosting and cloud providers.',
    ],
  },
  {
    title: '3. How we use it',
    body: [
      '- To send the messages you ask us to send and to show you delivery reports.',
      '- To receive replies from your contacts and show them in your inbox.',
      '- When you switch on Agent mode: to let the AI provider you chose write short replies to your contacts.',
      '- To keep the service secure, prevent abuse and fix problems.',
      'We do not sell personal data and we do not use your contacts\' data for advertising.',
    ],
  },
  {
    title: '4. Who we share it with',
    body: [
      'We use trusted providers that process data for us:',
      '- Google (Firebase Authentication, Firestore database, Cloud Functions): stores account and message data and runs the backend.',
      '- Meta (WhatsApp Business Platform): delivers your messages and sends us replies and delivery receipts. Meta\'s own terms and privacy policy apply to messages on WhatsApp.',
      '- Your chosen AI provider (for example Google Gemini, OpenAI, Anthropic, Groq or another service you add), only if Agent mode is on: it receives the contact\'s message, recent chat messages and the details from your sheet for that contact, so it can write a reply.',
      '- Vercel: hosts the website.',
      'We may also disclose data if the law requires it.',
    ],
  },
  {
    title: '5. Your responsibilities and your contacts\' data',
    body: [
      'For the data of your contacts, you decide why and how it is used, and we process it on your behalf.',
      '- Only upload and message people who agreed to hear from you on WhatsApp, and follow WhatsApp\'s business and messaging policies and the laws that apply to you.',
      '- Do not send medical diagnoses or other sensitive details in messages. The AI agent is set up not to give medical advice and to pass urgent messages to your staff.',
      '- If one of your contacts replies STOP, we mark them as opted out immediately and stop sending them campaign messages. Replying START turns messages on again.',
    ],
  },
  {
    title: '6. Your rights',
    body: [
      'You can ask to see, correct, export or delete the personal data we hold about you. Your contacts can ask you for the same, and you can ask us to help.',
      `To make a request, write to ${COMPANY.contactEmail || 'the support contact of the business that gave you access to this service'}. We will answer within a reasonable time.`,
    ],
  },
  {
    title: '7. How long we keep data',
    body: [
      'We keep your data while your account is active. When you ask us to delete your account, we delete your account, contacts, messages, reports and stored secrets, except what we must keep by law. Copies in backups are removed on the provider\'s normal schedule.',
    ],
  },
  {
    title: '8. Security',
    body: [
      '- Each account can only read its own data. This is enforced by database security rules.',
      '- WhatsApp tokens and AI keys cannot be read from the app at all.',
      '- Data is encrypted in transit, and our cloud providers encrypt stored data.',
      'No system is perfectly secure. If we learn of a breach that affects you, we will tell you without undue delay.',
    ],
  },
  {
    title: '9. Where data is processed',
    body: [
      'Our database and backend run on Google Cloud in the United States (us-central1). WhatsApp messages are processed by Meta, and AI requests by the AI provider you choose, who may process data in other countries. By using the service you accept this transfer.',
    ],
  },
  {
    title: '10. Children',
    body: [`${COMPANY.product} is for businesses. It is not meant for people under 18 and we do not knowingly collect their data for ourselves.`],
  },
  {
    title: '11. Changes to this policy',
    body: [
      `We may update this policy. The version date is ${POLICY_VERSION}. When it changes, you will be asked to read and accept the new version before you continue.`,
    ],
  },
  {
    title: '12. Contact',
    body: [
      COMPANY.contactEmail
        ? `Questions about privacy: ${COMPANY.contactEmail}`
        : 'Questions about privacy: contact the business that gave you access to this service.',
    ],
  },
];
