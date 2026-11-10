import { escapeRegex } from "./text";

/**
 * Skill taxonomy. Matching is lexical and deterministic: a skill is only ever "found"
 * where one of its aliases literally appears, so every match can be shown to the user
 * as a quote. `family` groups substitutable skills (React ~ Vue); a family match is
 * reported as "related", never as the skill itself.
 */
export type SkillCategory =
  | "language"
  | "frontend"
  | "backend"
  | "data"
  | "ml"
  | "cloud"
  | "foundations"
  | "product"
  | "design"
  | "business"
  | "soft";

export interface Skill {
  id: string;
  name: string;
  category: SkillCategory;
  aliases: string[];
  family?: string;
  /** A custom pattern for aliases too ambiguous for a plain word match (Go, R, C). */
  pattern?: RegExp;
}

const s = (
  id: string,
  name: string,
  category: SkillCategory,
  aliases: string[] = [],
  family?: string,
  pattern?: RegExp,
): Skill => ({ id, name, category, aliases: [name.toLowerCase(), ...aliases], family, pattern });

export const SKILLS: Skill[] = [
  // languages
  s("python", "Python", "language"),
  s("java", "Java", "language", [], "jvm"),
  s("javascript", "JavaScript", "language", ["js", "es6", "ecmascript"], "js"),
  s("typescript", "TypeScript", "language", ["ts"], "js"),
  s("cpp", "C++", "language", ["cpp", "c plus plus"], "systems"),
  s("csharp", "C#", "language", ["c sharp", ".net", "dotnet", "asp.net"]),
  s("go", "Go", "language", ["golang"], "systems", /\bgolang\b|\bGo\b(?=\s*[,/;)|]|\s+(?:and|or|programming|language|services?|developer|engineer)\b|\s*$)/),
  s("rust", "Rust", "language", [], "systems"),
  s("kotlin", "Kotlin", "language", [], "jvm"),
  s("swift", "Swift", "language", ["swiftui"]),
  s("ruby", "Ruby", "language"),
  s("php", "PHP", "language", ["laravel"]),
  s("scala", "Scala", "language", [], "jvm"),
  s("sql", "SQL", "language", ["t-sql", "pl/sql", "plsql"]),
  s("r", "R", "language", [], undefined, /\bR\b(?=\s*[,/;)|]|\s+(?:programming|language|studio)\b)|\bRStudio\b|\btidyverse\b|\bggplot2?\b/),
  s("c", "C", "language", [], "systems", /\bC\b(?=\s*[,/;)|](?!\s*\+)|\s+(?:programming|language)\b)|\bembedded c\b/i),
  s("bash", "Bash", "language", ["shell scripting", "shell script", "shell scripts"]),
  // frontend / mobile
  s("react", "React", "frontend", ["react.js", "reactjs"], "fe-framework"),
  s("nextjs", "Next.js", "frontend", ["nextjs", "next js"]),
  s("vue", "Vue", "frontend", ["vue.js", "vuejs", "nuxt"], "fe-framework"),
  s("angular", "Angular", "frontend", ["angularjs"], "fe-framework"),
  s("svelte", "Svelte", "frontend", ["sveltekit"], "fe-framework"),
  s("html", "HTML", "frontend", ["html5"]),
  s("css", "CSS", "frontend", ["css3", "sass", "scss"]),
  s("tailwind", "Tailwind CSS", "frontend", ["tailwind", "tailwindcss"]),
  s("redux", "Redux", "frontend", ["zustand", "state management"]),
  s("react-native", "React Native", "frontend", [], "mobile"),
  s("flutter", "Flutter", "frontend", ["dart"], "mobile"),
  s("android", "Android", "frontend", ["jetpack compose"], "mobile"),
  s("ios", "iOS", "frontend", ["uikit"], "mobile"),
  // backend
  s("nodejs", "Node.js", "backend", ["node", "nodejs", "node js"], "be-runtime"),
  s("express", "Express", "backend", ["express.js", "expressjs", "nestjs", "nest.js"]),
  s("django", "Django", "backend", [], "py-web"),
  s("flask", "Flask", "backend", [], "py-web"),
  s("fastapi", "FastAPI", "backend", [], "py-web"),
  s("spring", "Spring Boot", "backend", ["spring", "spring framework"]),
  s("rails", "Ruby on Rails", "backend", ["rails"]),
  s("graphql", "GraphQL", "backend", ["apollo"], "api"),
  s("rest", "REST APIs", "backend", ["rest api", "restful", "rest", "api design", "apis"], "api"),
  s("grpc", "gRPC", "backend", ["protobuf"], "api"),
  s("microservices", "Microservices", "backend", ["distributed systems", "service-oriented"]),
  // data
  s("postgres", "PostgreSQL", "data", ["postgres", "psql"], "rdbms"),
  s("mysql", "MySQL", "data", ["mariadb"], "rdbms"),
  s("mongodb", "MongoDB", "data", ["mongo", "nosql"], "nosql"),
  s("redis", "Redis", "data", [], "cache"),
  s("kafka", "Kafka", "data", ["rabbitmq", "message queue", "message queues", "pub/sub"]),
  s("spark", "Apache Spark", "data", ["spark", "pyspark", "hadoop"], "big-data"),
  s("airflow", "Airflow", "data", ["dagster", "orchestration"]),
  s("dbt", "dbt", "data"),
  s("warehouse", "Data warehousing", "data", ["snowflake", "bigquery", "redshift", "data warehouse"], "warehouse"),
  s("elasticsearch", "Elasticsearch", "data", ["opensearch"]),
  s("etl", "ETL pipelines", "data", ["etl", "elt", "data pipeline", "data pipelines"]),
  s("excel", "Excel", "data", ["spreadsheets", "google sheets", "pivot tables"]),
  s("tableau", "Tableau", "data", [], "bi"),
  s("powerbi", "Power BI", "data", ["powerbi", "looker", "metabase"], "bi"),
  s("pandas", "pandas", "data", ["numpy"]),
  s("statistics", "Statistics", "data", ["statistical analysis", "hypothesis testing", "regression analysis", "probability"]),
  s("ab-testing", "A/B testing", "data", ["a/b tests", "ab testing", "experimentation", "experiment design"]),
  s("data-analysis", "Data analysis", "data", ["data analytics", "analyzing data", "analysing data", "exploratory data analysis", "eda"]),
  s("data-viz", "Data visualization", "data", ["data visualisation", "dashboards", "dashboarding", "matplotlib"]),
  // ml
  s("machine-learning", "Machine learning", "ml", ["ml", "scikit-learn", "sklearn", "xgboost"]),
  s("deep-learning", "Deep learning", "ml", ["neural networks", "neural network", "cnn", "transformers"]),
  s("pytorch", "PyTorch", "ml", [], "dl-framework"),
  s("tensorflow", "TensorFlow", "ml", ["keras"], "dl-framework"),
  s("nlp", "NLP", "ml", ["natural language processing"]),
  s("llm", "LLMs", "ml", ["llm", "large language models", "generative ai", "genai", "prompt engineering", "rag", "langchain"]),
  s("computer-vision", "Computer vision", "ml", ["opencv", "image processing"]),
  // cloud / devops
  s("aws", "AWS", "cloud", ["amazon web services", "ec2", "s3", "lambda"], "cloud"),
  s("gcp", "Google Cloud", "cloud", ["gcp", "google cloud platform"], "cloud"),
  s("azure", "Azure", "cloud", ["microsoft azure"], "cloud"),
  s("docker", "Docker", "cloud", ["containers", "containerization", "containerisation"]),
  s("kubernetes", "Kubernetes", "cloud", ["k8s", "helm"]),
  s("terraform", "Terraform", "cloud", ["infrastructure as code", "iac", "ansible"]),
  s("ci-cd", "CI/CD", "cloud", ["ci/cd", "cicd", "continuous integration", "github actions", "jenkins", "gitlab ci"]),
  s("linux", "Linux", "cloud", ["unix"]),
  s("git", "Git", "cloud", ["github", "gitlab", "version control"]),
  s("monitoring", "Monitoring & observability", "cloud", ["observability", "prometheus", "grafana", "datadog", "monitoring"]),
  // foundations
  s("dsa", "Data structures & algorithms", "foundations", ["data structures", "algorithms", "dsa", "leetcode", "competitive programming"]),
  s("system-design", "System design", "foundations", ["systems design", "scalability", "software architecture"]),
  s("oop", "Object-oriented programming", "foundations", ["oop", "oops", "object oriented", "object-oriented design"]),
  s("testing", "Automated testing", "foundations", ["unit testing", "unit tests", "integration tests", "test automation", "jest", "pytest", "junit", "selenium", "cypress", "playwright", "tdd"]),
  s("security", "Security", "foundations", ["application security", "owasp", "authentication", "oauth"]),
  s("os-networks", "OS & networking fundamentals", "foundations", ["operating systems", "computer networks", "networking", "tcp/ip", "dbms"]),
  // product
  s("product-management", "Product management", "product", ["product manager", "product strategy", "product sense"]),
  s("roadmapping", "Roadmapping", "product", ["roadmap", "roadmaps", "prioritization", "prioritisation"]),
  s("user-research", "User research", "product", ["user interviews", "usability testing", "customer interviews", "customer research"]),
  s("prd", "Product specs", "product", ["prd", "prds", "product requirements", "user stories", "product specs"]),
  s("agile", "Agile", "product", ["scrum", "sprint planning", "kanban", "jira"]),
  s("product-analytics", "Product analytics", "product", ["mixpanel", "amplitude", "funnel analysis", "cohort analysis", "metrics"]),
  // design
  s("figma", "Figma", "design", ["sketch", "adobe xd"]),
  s("ux-design", "UX design", "design", ["ux", "user experience", "interaction design", "wireframes", "wireframing"]),
  s("ui-design", "UI design", "design", ["visual design", "user interface design"]),
  s("prototyping", "Prototyping", "design", ["prototypes", "prototype"]),
  s("design-systems", "Design systems", "design", ["design system", "component library", "component libraries"]),
  s("accessibility", "Accessibility", "design", ["a11y", "wcag"]),
  // business
  s("seo", "SEO", "business", ["search engine optimization", "sem"]),
  s("content", "Content marketing", "business", ["copywriting", "content writing", "content strategy"]),
  s("social-media", "Social media marketing", "business", ["social media", "community management"]),
  s("marketing-analytics", "Marketing analytics", "business", ["google analytics", "ga4", "campaign analysis", "performance marketing"]),
  s("crm", "CRM tools", "business", ["crm", "salesforce", "hubspot"]),
  s("sales", "Sales", "business", ["business development", "lead generation", "cold calling", "prospecting"]),
  s("customer-success", "Customer success", "business", ["customer support", "account management", "customer service"]),
  s("finance", "Financial modeling", "business", ["financial modelling", "financial analysis", "valuation", "accounting"]),
  s("operations", "Operations", "business", ["process improvement", "supply chain", "logistics"]),
  // soft
  s("communication", "Communication", "soft", ["written communication", "verbal communication", "presentation skills", "public speaking", "technical writing", "documentation"]),
  s("leadership", "Leadership", "soft", ["team lead", "led a team", "mentoring", "mentorship", "mentored"]),
  s("collaboration", "Collaboration", "soft", ["cross-functional", "teamwork", "stakeholder management", "stakeholders"]),
  s("problem-solving", "Problem solving", "soft", ["analytical skills", "analytical thinking", "critical thinking"]),
];

const BY_ID = new Map(SKILLS.map((k) => [k.id, k]));
export function skillById(id: string): Skill | undefined {
  return BY_ID.get(id);
}

function aliasRegex(alias: string): string {
  // Word boundaries that also work for aliases containing symbols (c++, .net, ci/cd).
  const body = escapeRegex(alias).replace(/\\ /g, "[\\s-]+").replace(/ /g, "[\\s-]+");
  return `(?<![a-z0-9+#])${body}(?![a-z0-9+#]|\\.[a-z])`;
}

const COMPILED: { skill: Skill; re: RegExp }[] = SKILLS.map((skill) => {
  if (skill.pattern) return { skill, re: new RegExp(skill.pattern.source, skill.pattern.flags.includes("g") ? skill.pattern.flags : skill.pattern.flags + "g") };
  const alts = [...skill.aliases].sort((a, b) => b.length - a.length).map(aliasRegex);
  return { skill, re: new RegExp(alts.join("|"), "gi") };
});

export interface SkillHit {
  skillId: string;
  start: number;
  end: number;
  text: string;
}

/** All literal skill mentions in `text`, with offsets. */
export function findSkills(text: string): SkillHit[] {
  const hits: SkillHit[] = [];
  for (const { skill, re } of COMPILED) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      hits.push({ skillId: skill.id, start: m.index, end: m.index + m[0].length, text: m[0] });
    }
  }
  return hits.sort((a, b) => a.start - b.start);
}

export function skillIdsIn(text: string): string[] {
  return [...new Set(findSkills(text).map((h) => h.skillId))];
}

export function sameFamily(a: string, b: string): boolean {
  const fa = BY_ID.get(a)?.family;
  return fa !== undefined && fa === BY_ID.get(b)?.family && a !== b;
}
