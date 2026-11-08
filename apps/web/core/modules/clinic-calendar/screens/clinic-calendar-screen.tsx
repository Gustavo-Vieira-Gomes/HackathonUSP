import { SignOutButton } from '@/core/modules/clinic/components/sign-out-button';
import {
  connectGoogleCalendarAction,
  selectGoogleCalendarAction,
} from '../clinic-calendar.actions';
import { COPY, type ClinicCalendarView } from '../clinic-calendar-view';

type Props =
  { kind: 'not-clinic' } | { kind: 'view'; view: ClinicCalendarView };

export default function ClinicCalendarScreen(props: Props) {
  if (props.kind === 'not-clinic') {
    return (
      <section
        className="clinic-page clinic-narrow"
        aria-labelledby="agenda-title"
      >
        <h1 id="agenda-title" className="clinic-title">
          Esta conta não é de clínica
        </h1>
        <p className="intro">
          Você entrou com uma conta de paciente. Saia e entre com a conta da
          clínica.
        </p>
        <SignOutButton />
      </section>
    );
  }

  const { view } = props;
  return (
    <section
      className="clinic-page clinic-narrow"
      aria-labelledby="agenda-title"
    >
      <p className="eyebrow">Painel da clínica</p>
      <h1 id="agenda-title" className="clinic-title">
        Google Agenda
      </h1>
      {view.alert ? (
        <p className="form-alert" role="alert">
          {view.alert}
        </p>
      ) : null}
      <div className="clinic-form">
        {view.statusText ? (
          <section className="form-group" aria-labelledby="status-title">
            <h2 id="status-title">Status</h2>
            <p>
              <strong>{view.statusText}</strong>
              {view.calendarName ? ` · ${view.calendarName}` : null}
            </p>
          </section>
        ) : null}
        {view.notice ? <p className="intro">{view.notice}</p> : null}
        {view.calendars ? (
          <form action={selectGoogleCalendarAction} className="form-group">
            <fieldset>
              <legend>Agenda dos exames</legend>
              {view.calendars.map((calendar, index) => (
                <div className="field" key={calendar.id}>
                  <input
                    type="radio"
                    id={`calendar-${index}`}
                    name="calendarId"
                    value={calendar.id}
                    defaultChecked={index === 0}
                    required
                  />
                  <label htmlFor={`calendar-${index}`}>
                    {calendar.name}
                    {calendar.primary ? ' (principal)' : null}
                  </label>
                </div>
              ))}
            </fieldset>
            <button className="primary-button" type="submit">
              {COPY.useButton}
            </button>
          </form>
        ) : null}
        {view.emptyText ? <p className="intro">{view.emptyText}</p> : null}
        {view.showConnect ? (
          <form action={connectGoogleCalendarAction}>
            <button className="primary-button" type="submit">
              {COPY.connectButton}
            </button>
          </form>
        ) : null}
      </div>
    </section>
  );
}
