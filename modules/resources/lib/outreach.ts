export type OutreachAudience = "Recruiter" | "Hiring Manager" | "Alumni" | "Referral" | "Follow-up"

export interface OutreachTemplate {
  id: string
  name: string
  audience: OutreachAudience
  subject: string
  body: string
}

/** Variables users fill in; keys match the {{tokens}} used in templates. */
export interface OutreachVars {
  company: string
  role: string
  contact: string
  yourName: string
  highlight: string
}

export const OUTREACH_FIELDS: Array<{ key: keyof OutreachVars; label: string; placeholder: string }> = [
  { key: "contact", label: "Contact name", placeholder: "Jordan" },
  { key: "company", label: "Company", placeholder: "Acme" },
  { key: "role", label: "Role", placeholder: "Software Engineer" },
  { key: "highlight", label: "Your highlight", placeholder: "shipped a payments API used by 2M users" },
  { key: "yourName", label: "Your name", placeholder: "Alex" },
]

/**
 * Replace {{token}} placeholders with provided values. Missing or empty
 * values fall back to a visible [token] so gaps are obvious in the preview.
 */
export function fillTemplate(text: string, vars: Partial<OutreachVars>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = vars[key as keyof OutreachVars]
    return value && value.trim() ? value.trim() : `[${key}]`
  })
}

export const OUTREACH_TEMPLATES: OutreachTemplate[] = [
  {
    id: "recruiter-intro",
    name: "Recruiter introduction",
    audience: "Recruiter",
    subject: "Interested in the {{role}} role at {{company}}",
    body: `Hi {{contact}},

I came across the {{role}} opening at {{company}} and wanted to introduce myself. I recently {{highlight}}, which lines up closely with what the role calls for.

Would you be open to a quick chat about the position and what your team is looking for? Happy to share my resume and work samples.

Thanks for your time,
{{yourName}}`,
  },
  {
    id: "hiring-manager",
    name: "Hiring manager cold email",
    audience: "Hiring Manager",
    subject: "{{role}} at {{company}} — quick intro",
    body: `Hi {{contact}},

I'm reaching out directly because I'm genuinely excited about the {{role}} role on your team at {{company}}. In my last role I {{highlight}}, and I'd love to bring that to your team.

I know your time is tight — would a 15-minute call this week or next work to see if there's a fit?

Best,
{{yourName}}`,
  },
  {
    id: "alumni",
    name: "Alumni connection",
    audience: "Alumni",
    subject: "Fellow alum interested in {{company}}",
    body: `Hi {{contact}},

I noticed we share an alma mater and that you're at {{company}} — I've been following the {{role}} opening there. I recently {{highlight}} and would value any insight into the team and hiring process.

No pressure at all, but if you have 10 minutes for a quick call or even a few emails, I'd really appreciate it.

Go [team], and thanks!
{{yourName}}`,
  },
  {
    id: "referral-request",
    name: "Referral request",
    audience: "Referral",
    subject: "Would you be open to referring me for {{role}}?",
    body: `Hi {{contact}},

I hope you're doing well! I'm applying for the {{role}} role at {{company}} and saw you work there. Given that I {{highlight}}, I think I'd be a strong fit.

Would you feel comfortable referring me? I'm happy to send my resume and a short blurb to make it easy. Totally understand if not.

Thank you either way,
{{yourName}}`,
  },
  {
    id: "post-app-followup",
    name: "Follow-up after applying",
    audience: "Follow-up",
    subject: "Following up on my {{role}} application",
    body: `Hi {{contact}},

I applied for the {{role}} role at {{company}} last week and wanted to reaffirm my interest. Since applying, I've been thinking about how my experience — I {{highlight}} — maps to the team's goals.

Is there anything else I can share to support my application? I'd welcome the chance to talk.

Best,
{{yourName}}`,
  },
]
