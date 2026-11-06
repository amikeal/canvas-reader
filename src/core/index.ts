import { parseCartridge } from './parse';
import { buildSite, type BuildOptions, type SiteBuild } from './site';
import { readArchive, writeArchive, DEFAULT_LIMITS, type ArchiveLimits } from './zip';
import type { Course } from './model';

export type { BuildOptions, SiteBuild, Course };
export { parseCartridge, buildSite, readArchive, writeArchive };

export interface ConvertResult {
  course: Course;
  site: SiteBuild;
  /** Archive-level + parse-level + build-level warnings, de-duplicated. */
  warnings: string[];
}

export async function convert(imscc: Uint8Array, options: BuildOptions = {}, limits: ArchiveLimits = DEFAULT_LIMITS): Promise<ConvertResult> {
  const { archive, warnings: zipWarnings } = await readArchive(imscc, limits);
  const course = parseCartridge(archive, zipWarnings);
  const site = buildSite(course, archive, options);
  return { course, site, warnings: [...new Set([...course.warnings, ...site.warnings])] };
}

export function zipSite(site: SiteBuild): Promise<Uint8Array> {
  return writeArchive(site.files, site.rootName);
}
