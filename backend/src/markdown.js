const checklistRegex = /^\s*[-*]\s+\[( |x|X)\]\s+(.+)$/;
const headingRegex = /^\s{0,3}#{1,6}\s+(.+)$/;

function slugify(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "general";
}

function splitTitleAndDescription(raw) {
  const [title, description] = raw.split("::").map((part) => part.trim());
  return {
    title: title || raw.trim(),
    description: description || "",
  };
}

export function parseTasksFromMarkdown(markdown, defaultProject = "general") {
  const lines = String(markdown || "").split(/\r?\n/);
  let currentProject = defaultProject;
  const tasks = [];

  for (const line of lines) {
    const heading = line.match(headingRegex);
    if (heading) {
      currentProject = slugify(heading[1]);
      continue;
    }

    const checklist = line.match(checklistRegex);
    if (!checklist) {
      continue;
    }

    const isCompleted = checklist[1].toLowerCase() === "x";
    const { title, description } = splitTitleAndDescription(checklist[2]);

    tasks.push({
      title,
      description,
      project_id: currentProject,
      status: isCompleted ? "COMPLETED" : "PENDING",
      completed: isCompleted,
    });
  }

  return tasks;
}
