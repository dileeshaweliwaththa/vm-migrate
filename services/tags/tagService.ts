import { findAllTags } from '@/repositories/tags/tagRepository';

// Service layer: tag reads for the tag picker.
export const listTagNames = async (): Promise<string[]> => {
  const tags = await findAllTags();
  return tags.map((t) => t.name);
};
