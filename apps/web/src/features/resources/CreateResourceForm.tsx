import { useId, useState, type FormEvent } from 'react';

/**
 * Client-side validation mirroring the backend authority (R5, R10.8).
 *
 * The backend remains the source of truth; these checks only give immediate,
 * non-sensitive inline feedback for obviously invalid input before a request is
 * issued:
 * - `title` must be non-empty after trimming whitespace (backend INVALID_TITLE);
 * - `url` must parse via `new URL(...)` with an `http:`/`https:` protocol
 *   (backend INVALID_URL).
 */
export const isValidTitle = (title: string): boolean => title.trim().length > 0;

export const isValidUrl = (url: string): boolean => {
  const trimmed = url.trim();
  if (trimmed.length === 0) {
    return false;
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

export type CreateResourceFormProps = {
  /**
   * Submits the validated input. Returns a promise so the form can disable its
   * primary action while the create request is in flight. The parent owns the
   * create state machine (submitting/success/error) and the resulting status
   * copy; this component only reports a valid submission.
   */
  onSubmit: (input: { title: string; url: string }) => void | Promise<void>;
  /** True while the parent's create request is in flight. */
  submitting: boolean;
  /**
   * Optional server-driven field hints keyed off the backend `error.code`
   * (e.g. `INVALID_TITLE`, `INVALID_URL`), surfaced inline so a server 400 maps
   * to the same field feedback as the client-side checks.
   */
  serverErrorCode?: string;
};

/**
 * Create form for a saved resource: a `title` and a `url` with ONE primary
 * action labelled "Guardar" (R10.3).
 *
 * Validation (R10.8): on submit the form validates `title` (non-empty after
 * trim) and `url` (valid absolute `http(s)` URL) and shows inline hints for the
 * invalid fields without issuing a request. Only when both are valid does it
 * call `onSubmit` with the trimmed values. The backend stays the authority; a
 * server `400` is reflected via `serverErrorCode` into the same inline hints.
 *
 * The form never clears destructively on failure — the parent keeps the fields
 * intact so the user can correct and retry (R10.7). The fields are controlled
 * here; on a successful submit the parent is responsible for the list update,
 * and this component clears its own inputs only after `onSubmit` resolves.
 */
export const CreateResourceForm = ({
  onSubmit,
  submitting,
  serverErrorCode,
}: CreateResourceFormProps) => {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  // Whether the user has attempted a submit — gates inline hints so the form is
  // not noisy before the first interaction.
  const [attempted, setAttempted] = useState(false);

  const titleFieldId = useId();
  const urlFieldId = useId();
  const titleHintId = `${titleFieldId}-hint`;
  const urlHintId = `${urlFieldId}-hint`;

  const titleValid = isValidTitle(title);
  const urlValid = isValidUrl(url);

  // A server 400 maps its code to the matching field hint even if the local
  // value looks acceptable (the backend is the authority).
  const titleHasError = (attempted && !titleValid) || serverErrorCode === 'INVALID_TITLE';
  const urlHasError = (attempted && !urlValid) || serverErrorCode === 'INVALID_URL';

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAttempted(true);

    if (!titleValid || !urlValid) {
      // Invalid input never issues a request; the inline hints guide the fix.
      return;
    }

    await onSubmit({ title: title.trim(), url: url.trim() });

    // Clear only after a resolved submit so a failing create keeps the user's
    // input intact for correction (R10.7). The parent surfaces create errors.
    setTitle('');
    setUrl('');
    setAttempted(false);
  };

  return (
    <form className="saved-resources__form" onSubmit={handleSubmit} noValidate>
      <div className="saved-resources__field">
        <label className="saved-resources__label" htmlFor={titleFieldId}>
          Título
        </label>
        <input
          id={titleFieldId}
          className={
            titleHasError
              ? 'saved-resources__input saved-resources__input--invalid'
              : 'saved-resources__input'
          }
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          disabled={submitting}
          aria-invalid={titleHasError}
          aria-describedby={titleHasError ? titleHintId : undefined}
          placeholder="AWS Lambda Best Practices"
        />
        {titleHasError && (
          <p id={titleHintId} className="saved-resources__hint">
            Escribe un título (no puede quedar vacío).
          </p>
        )}
      </div>

      <div className="saved-resources__field">
        <label className="saved-resources__label" htmlFor={urlFieldId}>
          URL
        </label>
        <input
          id={urlFieldId}
          className={
            urlHasError
              ? 'saved-resources__input saved-resources__input--invalid'
              : 'saved-resources__input'
          }
          type="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          disabled={submitting}
          aria-invalid={urlHasError}
          aria-describedby={urlHasError ? urlHintId : undefined}
          placeholder="https://docs.aws.amazon.com/"
          inputMode="url"
        />
        {urlHasError && (
          <p id={urlHintId} className="saved-resources__hint">
            Introduce una URL válida que empiece por http:// o https://.
          </p>
        )}
      </div>

      <div className="saved-resources__actions">
        <button
          type="submit"
          className="saved-resources__submit"
          disabled={submitting}
        >
          {submitting ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  );
};
