export interface Job {
  id:          string
  title:       string
  company:     string
  companyLogo: string | null
  url:         string
  category:    string
  tags:        string[]
  salaryRange: string | null
  jobType:     string
  location:    string | null
  postedAt:    string
}

export const JOB_CATEGORIES = [
  { label: 'All',        value: 'all' },
  { label: 'Frontend',   value: 'frontend' },
  { label: 'Backend',    value: 'backend' },
  { label: 'Fullstack',  value: 'fullstack' },
  { label: 'DevOps',     value: 'devops' },
  { label: 'Design',     value: 'design' },
  { label: 'Mobile',     value: 'mobile' },
] as const

export type JobCategory = typeof JOB_CATEGORIES[number]['value']

// Remotive category slugs that map to our categories
export const REMOTIVE_CATEGORY_MAP: Record<string, string> = {
  'software-dev':      'fullstack',
  'frontend':          'frontend',
  'backend':           'backend',
  'devops-sysadmin':   'devops',
  'design':            'design',
  'mobile-jobs':       'mobile',
}
