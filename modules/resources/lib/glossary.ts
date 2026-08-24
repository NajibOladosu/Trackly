export interface GlossaryTerm {
  term: string
  abbreviation?: string
  category: "Process" | "Documents" | "Interview" | "Compensation" | "Systems"
  definition: string
}

/** Plain-English explanations of common hiring and job-search jargon. */
export const GLOSSARY: GlossaryTerm[] = [
  {
    term: "Applicant Tracking System",
    abbreviation: "ATS",
    category: "Systems",
    definition:
      "Software companies use to collect, filter, and rank applications. Many parse your resume for keywords before a human sees it, so matching the job description's language matters.",
  },
  {
    term: "STAR Method",
    category: "Interview",
    definition:
      "A structure for behavioral answers: Situation, Task, Action, Result. It keeps stories concise and outcome-focused.",
  },
  {
    term: "Behavioral Interview",
    category: "Interview",
    definition:
      "An interview that asks about past experiences ('Tell me about a time...') to predict future behavior. Best answered with the STAR method.",
  },
  {
    term: "Technical Screen",
    category: "Interview",
    definition:
      "An early-stage interview that tests core skills — often a coding exercise, take-home task, or systems discussion — before onsite rounds.",
  },
  {
    term: "Phone Screen",
    category: "Interview",
    definition:
      "A short initial call, usually with a recruiter, to confirm basic fit, salary expectations, and interest before deeper interviews.",
  },
  {
    term: "Onsite",
    category: "Interview",
    definition:
      "The final interview stage — historically in person, now often virtual — with several back-to-back rounds covering different skills.",
  },
  {
    term: "Take-Home Assignment",
    category: "Interview",
    definition:
      "A project you complete on your own time to demonstrate skills. Clarify scope and expected time investment before starting.",
  },
  {
    term: "Cover Letter",
    category: "Documents",
    definition:
      "A short letter accompanying your resume that explains why you fit the specific role and company. Tailor it per application.",
  },
  {
    term: "Curriculum Vitae",
    abbreviation: "CV",
    category: "Documents",
    definition:
      "A detailed academic/professional history. In the US a CV is used mainly in academia; elsewhere 'CV' often just means resume.",
  },
  {
    term: "Portfolio",
    category: "Documents",
    definition:
      "A curated collection of your work (designs, code, writing) that shows evidence of skills beyond what a resume can state.",
  },
  {
    term: "Referral",
    category: "Process",
    definition:
      "When a current employee recommends you for a role. Referrals often skip the initial screen and significantly raise callback odds.",
  },
  {
    term: "Recruiter",
    category: "Process",
    definition:
      "A person who sources and screens candidates. Internal recruiters work for the hiring company; agency recruiters place candidates across companies.",
  },
  {
    term: "Hiring Manager",
    category: "Process",
    definition:
      "The person you'd ultimately report to. They own the decision and care most about whether you can do the job.",
  },
  {
    term: "Job Requisition",
    abbreviation: "Req",
    category: "Process",
    definition:
      "An approved, funded open role. If a posting has no active req, hiring may be paused regardless of the listing.",
  },
  {
    term: "Ghosting",
    category: "Process",
    definition:
      "When a company stops responding with no rejection or update. Common but not a reflection of your worth — keep applying elsewhere.",
  },
  {
    term: "Offer Letter",
    category: "Compensation",
    definition:
      "A formal document stating role, salary, start date, and terms. It is usually negotiable and not binding until signed.",
  },
  {
    term: "Base Salary",
    category: "Compensation",
    definition:
      "Your fixed annual pay before bonuses, equity, or benefits. It's the number most other compensation is calculated from.",
  },
  {
    term: "Equity",
    category: "Compensation",
    definition:
      "Ownership in the company, often as stock options or RSUs. Value depends on the company's future — treat startup equity as uncertain.",
  },
  {
    term: "Restricted Stock Units",
    abbreviation: "RSU",
    category: "Compensation",
    definition:
      "Company shares granted to you that vest over time. Once vested they are yours, taxed as income at vesting.",
  },
  {
    term: "Vesting",
    category: "Compensation",
    definition:
      "The schedule over which equity becomes yours — commonly four years with a one-year 'cliff' before any vests.",
  },
  {
    term: "Total Compensation",
    abbreviation: "TC",
    category: "Compensation",
    definition:
      "The full value of an offer: base salary plus bonus, equity, and benefits. Compare offers on TC, not base alone.",
  },
  {
    term: "Counteroffer",
    category: "Compensation",
    definition:
      "A revised offer made after you negotiate, or one from your current employer to keep you from leaving.",
  },
  {
    term: "Culture Fit",
    category: "Process",
    definition:
      "How well your working style aligns with the team. Increasingly reframed as 'culture add' — what new perspective you bring.",
  },
  {
    term: "Panel Interview",
    category: "Interview",
    definition:
      "One interview with multiple interviewers at once. Address the person who asked, but make eye contact with the whole panel.",
  },
  {
    term: "Debrief",
    category: "Process",
    definition:
      "The internal meeting where interviewers compare notes and decide. It's why feedback can take days after your last round.",
  },
]
