// Kept as a compatibility entry point. Software projects are stored locally;
// this module intentionally does not contact Supabase or any remote database.
export {
  deleteSoftwareProject,
  getSoftwareProject,
  listSoftwareProjects,
  saveSoftwareProject,
} from "./software-projects.local";
