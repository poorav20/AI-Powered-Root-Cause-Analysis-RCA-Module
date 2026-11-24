import { Link, useLocation } from 'react-router-dom'
import { ArrowLeft, ShieldCheck } from 'lucide-react'

const pages = {
  privacy: {
    title: 'Privacy Policy',
    intro: 'How AIVOA.AI handles information in the quality-operations workspace.',
    sections: [
      ['Information we process', 'We process account and workspace information, deviation and investigation records, uploaded source documents, and technical logs needed to operate, secure, and troubleshoot the service. Do not submit patient data, credentials, or information that is not necessary for the quality investigation.'],
      ['Why we use it', 'We use submitted information to extract deviation details, support root-cause analysis, generate CAPA suggestions, maintain auditability, and provide support. AI output is advisory and remains subject to qualified-person review.'],
      ['Service providers', 'Infrastructure, database, file-processing, and language-model providers process information only to provide the configured service. Review your organization’s vendor and data-processing requirements before connecting production records.'],
      ['Retention and security', 'Workspace records are retained according to your organization’s quality-record schedule. Access controls, encryption in transit, least-privilege service accounts, and audit logging should be enabled before production use.'],
      ['Your choices', 'You may request access, correction, export, or deletion of personal information. Deletion of regulated quality records may be restricted by applicable retention obligations.'],
    ],
  },
  terms: {
    title: 'Terms of Service',
    intro: 'Terms for using the AIVOA.AI quality investigation workspace.',
    sections: [
      ['Authorized use', 'Use the workspace only for lawful quality, manufacturing, and investigation activities. You are responsible for assigning access to trained personnel and protecting credentials.'],
      ['Human oversight', 'AI-generated extraction, causes, evidence gaps, and CAPA recommendations are suggestions. A qualified investigator must review, edit, approve, and own every regulated decision.'],
      ['Acceptable content', 'Do not upload malicious code, unrelated personal information, secrets, or records you are not authorized to process.'],
      ['Availability and changes', 'The service may change as security, regulatory, and operational requirements evolve. Material changes should be documented and communicated through your organization’s change-control process.'],
      ['Contact', 'Questions about these terms can be sent to legal@aivoa.ai. Replace this address with your organization’s approved legal contact before production launch.'],
    ],
  },
  refund: {
    title: 'Refund Policy',
    intro: 'A clear policy for paid plans and service credits.',
    sections: [
      ['Subscriptions', 'If a paid subscription is introduced, billing terms, renewal timing, taxes, and cancellation options will be shown before purchase. There are no hidden fees in this workspace.'],
      ['Cancellations', 'You may cancel renewal through the account billing settings or by contacting billing@aivoa.ai. Cancellation normally takes effect at the end of the current paid period.'],
      ['Refund requests', 'Contact billing@aivoa.ai within 14 days of a charge with the account identifier and reason. Approved refunds are returned to the original payment method where possible.'],
      ['Current status', 'No payment is requested by this local workspace. Configure and review a payment provider’s terms before enabling billing.'],
    ],
  },
  cookies: {
    title: 'Cookie Policy',
    intro: 'What browser storage this application uses and why.',
    sections: [
      ['Necessary storage', 'AIVOA.AI stores a privacy-choice value in your browser so the consent banner does not repeatedly appear. The application may also use session and security storage required for the workspace to function.'],
      ['Optional analytics', 'Optional analytics should be enabled only after consent. This build does not require advertising cookies or cross-site tracking to operate.'],
      ['Managing choices', 'Use “Use necessary only” to decline optional storage. Clear your browser site data to remove the stored choice, then select your preference again.'],
    ],
  },
}

export default function LegalPage() {
  const { pathname } = useLocation()
  const key = pathname.split('/').pop()
  const page = pages[key] || pages.privacy

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
      <Link to="/dashboard" className="inline-flex items-center gap-2 text-sm text-pharma-blue hover:underline">
        <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Back to workspace
      </Link>
      <header className="border-b border-gray-200 pb-6">
        <div className="flex items-center gap-3 text-pharma-blue mb-3">
          <ShieldCheck className="w-6 h-6" aria-hidden="true" />
          <span className="text-xs font-semibold uppercase tracking-[0.16em]">AIVOA.AI legal</span>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-gray-950">{page.title}</h1>
        <p className="mt-2 text-gray-600">{page.intro}</p>
        <p className="mt-3 text-xs text-gray-500">Last reviewed: 7 November 2026 · Version 1.0</p>
      </header>
      <div className="space-y-6">
        {page.sections.map(([heading, body]) => (
          <section key={heading} className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900">{heading}</h2>
            <p className="mt-2 text-sm leading-6 text-gray-700">{body}</p>
          </section>
        ))}
      </div>
      {key === 'privacy' && (
        <div className="card p-6 border-blue-200 bg-blue-50/50">
          <h2 className="text-lg font-semibold text-gray-900">Request data access or deletion</h2>
          <p className="mt-2 text-sm text-gray-700">Send a request to privacy@aivoa.ai with your organization, work email, and the records you want reviewed. We will verify authorization before acting.</p>
          <a className="btn-primary mt-4" href="mailto:privacy@aivoa.ai?subject=Data%20access%20or%20deletion%20request">Start a privacy request</a>
        </div>
      )}
    </div>
  )
}
