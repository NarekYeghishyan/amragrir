import { useRef, useState, type RefObject } from 'react';
import {
  IMAGE_UPLOAD_TYPE_LIST,
  MAX_IMAGE_UPLOAD_BYTES,
  MAX_IMAGE_UPLOAD_MB,
  type ImageUploadType,
} from '@amragrir/shared';
import type { AdminTranslationKey } from '@amragrir/i18n/admin';
import { api, errorText } from './api';
import { useT } from './i18n';
import { useToast } from './ui';

/**
 * A dish's photograph: what may be sent, and the control that sends it.
 *
 * Shared by the two forms that set one — adding a dish and editing one — because
 * they are the same job twice. A file input that behaved differently in the two
 * places a photograph is chosen would be a panel with two answers to one
 * question.
 */

/**
 * Why a chosen file will not be sent, or null if it will be.
 *
 * A courtesy, not the rule. The API sniffs the bytes and refuses on what it
 * finds there — a file renamed to `.jpg` gets past this and not past that — so
 * this exists only to answer instantly, and in a sentence about photographs
 * rather than one about media types, in the two cases that can be seen without
 * uploading anything.
 *
 * Takes the two fields it reads rather than a `File`, so the rule can be tested
 * without a browser.
 */
export function photoRefusal(file: {
  type: string;
  size: number;
}): AdminTranslationKey | null {
  if (!IMAGE_UPLOAD_TYPE_LIST.includes(file.type as ImageUploadType)) {
    return 'dishPhotoWrongType';
  }
  if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
    return 'dishPhotoTooLarge';
  }
  return null;
}

/**
 * An upload in progress.
 *
 * Deliberately holds **no URL**: the picture belongs to the form, which is what
 * submits it, and a second copy here would be a second answer to "which
 * photograph is this dish getting". What is here is the part the form has no
 * use for — whether an upload is still running, and the native input's own
 * selection.
 */
export interface PhotoUpload {
  /** Both forms hold their submit button for this. A dish saved mid-upload
   *  keeps the photograph somebody was in the middle of replacing. */
  uploading: boolean;
  /** Drops the native input's selection — after a save, so the next dish does
   *  not open on a form naming the previous one's file. */
  clear: () => void;
  /** Internals `<PhotoField>` renders. Not for callers. */
  input: RefObject<HTMLInputElement | null>;
  choose: (file: File | null) => Promise<void>;
}

/**
 * Uploading a photograph, and handing back the URL it was stored under.
 *
 * The upload happens on **choosing**, not on submit: the picture is on screen —
 * and already stored — before anything is saved, and `onUploaded` is the API's
 * answer rather than a file still waiting to be sent.
 *
 * A failed upload leaves the form's photograph where it was. It is the one that
 * will be saved if the form is submitted, so showing it is the truth; the toast
 * is what says the replacement did not happen.
 */
export function usePhotoUpload(onUploaded: (url: string) => void): PhotoUpload {
  const [uploading, setUploading] = useState(false);
  const t = useT();
  const toast = useToast();

  /** The chosen file stays in the input after a refusal, and choosing the same
   *  file again would fire no `change` — so a second attempt at the photo that
   *  was just rejected would do nothing at all. Cleared instead. */
  const input = useRef<HTMLInputElement>(null);
  const clear = (): void => {
    if (input.current !== null) {
      input.current.value = '';
    }
  };

  const choose = async (file: File | null): Promise<void> => {
    if (file === null) {
      return;
    }
    const refusal = photoRefusal(file);
    if (refusal !== null) {
      toast.error(t(refusal, { mb: MAX_IMAGE_UPLOAD_MB }));
      clear();
      return;
    }

    setUploading(true);
    try {
      const stored = await api.uploadMenuPhoto(file);
      onUploaded(stored.url);
    } catch (err) {
      clear();
      toast.error(errorText(t, err, 'errorUploadPhoto'));
    } finally {
      setUploading(false);
    }
  };

  return { uploading, clear, input, choose };
}

/**
 * The file itself, not a link to one.
 *
 * Whoever adds or edits a dish has a photograph of it on the machine in front of
 * them, and asking for a URL asks them to go and host it first.
 *
 * `url` is what the form is currently holding — on an edit, the dish's own
 * photograph until somebody replaces it, so the picture on screen is always the
 * one that will be saved.
 */
export function PhotoField({
  id,
  url,
  upload,
  disabled = false,
}: {
  id: string;
  url: string;
  upload: PhotoUpload;
  disabled?: boolean;
}) {
  const t = useT();
  return (
    <div className="upload">
      <input
        id={id}
        ref={upload.input}
        className="upload__input"
        type="file"
        accept={IMAGE_UPLOAD_TYPE_LIST.join(',')}
        disabled={disabled || upload.uploading}
        onChange={(event) => void upload.choose(event.target.files?.[0] ?? null)}
      />
      {upload.uploading ? (
        <span className="faint">{t('dishPhotoUploading')}</span>
      ) : (
        url !== '' && <img className="upload__preview" src={url} alt={t('dishPhotoAlt')} />
      )}
    </div>
  );
}
