import type { Resource } from '../../lib/api/resources-client';

/**
 * Formats an ISO-8601 `createdAt` timestamp into a readable, localized date for
 * display. Falls back to the raw value if it cannot be parsed, so a malformed
 * timestamp never breaks rendering.
 */
export const formatCreatedAt = (createdAt: string): string => {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) {
    return createdAt;
  }
  return date.toLocaleString('es', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export type ResourceListProps = {
  /** The caller's resources (already scoped server-side to the caller). */
  items: Resource[];
};

/**
 * Renders the caller's saved resources (R10.6) or, when there are none, a calm
 * empty state that is NOT an error (R10.5).
 *
 * Each item shows its `title` as a link to its `url` (with
 * `rel="noopener noreferrer"` for safe external navigation) and a readable
 * `createdAt`. Long titles/URLs wrap rather than overflowing horizontally
 * (handled in the CSS). The internal owner identifier is never part of a
 * `Resource`, so it is structurally impossible to render here.
 */
export const ResourceList = ({ items }: ResourceListProps) => {
  if (items.length === 0) {
    return (
      <div className="saved-resources__empty">
        <p className="saved-resources__empty-text">
          Aún no has guardado recursos. Añade tu primer título y URL para
          empezar.
        </p>
      </div>
    );
  }

  return (
    <ul className="saved-resources__items">
      {items.map((resource) => (
        <li key={resource.resourceId} className="saved-resources__item">
          <a
            className="saved-resources__item-link"
            href={resource.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {resource.title}
          </a>
          <span className="saved-resources__item-created">
            Guardado el {formatCreatedAt(resource.createdAt)}
          </span>
        </li>
      ))}
    </ul>
  );
};
