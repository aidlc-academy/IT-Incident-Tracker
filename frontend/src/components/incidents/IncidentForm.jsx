import { useState } from 'react';
import { SERVICES } from '../../utils/constants';
import { validateIncidentFields } from '../../utils/validators';

const BLANK = { title: '', description: '', service: '', businessImpact: '' };

/**
 * Shared create/edit form. `onSubmit` receives the sanitised fields and is
 * expected to return a promise; while it is pending the submit button is
 * disabled, which is what prevents a duplicate submission.
 */
export default function IncidentForm({
  initial,
  submitLabel = 'Create Incident',
  submitting = false,
  serverFieldError = null,
  onSubmit,
  onCancel,
}) {
  const [values, setValues] = useState({ ...BLANK, ...(initial || {}) });
  const [errors, setErrors] = useState({});

  const setField = (name) => (e) => {
    const { value } = e.target;
    setValues((v) => ({ ...v, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (submitting) return;

    const found = validateIncidentFields(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    onSubmit({
      title: values.title.trim(),
      description: values.description.trim(),
      service: values.service.trim(),
      businessImpact: values.businessImpact.trim(),
    });
  };

  // A field-level error returned by the backend takes precedence over the
  // local check, since it reflects what actually happened to the request.
  const errorFor = (name) =>
    (serverFieldError?.field === name ? serverFieldError.message : null) || errors[name];

  return (
    <form className="form" onSubmit={handleSubmit} noValidate>
      <div className="field">
        <label htmlFor="title">Title <span className="req">*</span></label>
        <input
          id="title"
          type="text"
          value={values.title}
          onChange={setField('title')}
          placeholder="Short summary of the problem"
          maxLength={200}
        />
        <div className="field__foot">
          <span className="field__error">{errorFor('title')}</span>
          <span className="field__count">{values.title.length}/200</span>
        </div>
      </div>

      <div className="field">
        <label htmlFor="description">Description <span className="req">*</span></label>
        <textarea
          id="description"
          rows={5}
          value={values.description}
          onChange={setField('description')}
          placeholder="What is happening, who is affected, and since when"
          maxLength={2000}
        />
        <div className="field__foot">
          <span className="field__error">{errorFor('description')}</span>
          <span className="field__count">{values.description.length}/2000</span>
        </div>
      </div>

      <div className="field">
        <label htmlFor="service">Service <span className="req">*</span></label>
        <input
          id="service"
          type="text"
          list="service-options"
          value={values.service}
          onChange={setField('service')}
          placeholder="e.g. Payment Gateway"
        />
        <datalist id="service-options">
          {SERVICES.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <div className="field__foot">
          <span className="field__error">{errorFor('service')}</span>
        </div>
      </div>

      <div className="field">
        <label htmlFor="businessImpact">Business impact <span className="req">*</span></label>
        <textarea
          id="businessImpact"
          rows={3}
          value={values.businessImpact}
          onChange={setField('businessImpact')}
          placeholder="What this costs the business while it is unresolved"
          maxLength={500}
        />
        <div className="field__foot">
          <span className="field__error">{errorFor('businessImpact')}</span>
          <span className="field__count">{values.businessImpact.length}/500</span>
        </div>
      </div>

      <div className="form__actions">
        <button type="submit" className="btn btn--primary" disabled={submitting}>
          {submitting ? 'Saving…' : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
