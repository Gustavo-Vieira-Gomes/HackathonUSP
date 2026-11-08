import type { ClinicProfile } from '@hackathon/contracts';
import Link from 'next/link';
import { SignOutButton } from '../components/sign-out-button';
import { formatMinutes, WEEKDAYS } from '../opening-hours';

type Props =
  | { kind: 'not-clinic' }
  | { kind: 'profile'; profile: ClinicProfile }
  | { kind: 'error' };

export default function ClinicPanelScreen(props: Props) {
  if (props.kind === 'not-clinic') {
    return (
      <section
        className="clinic-page clinic-narrow"
        aria-labelledby="panel-title"
      >
        <h1 id="panel-title" className="clinic-title">
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

  if (props.kind === 'error') {
    return (
      <section
        className="clinic-page clinic-narrow"
        aria-labelledby="panel-title"
      >
        <h1 id="panel-title" className="clinic-title">
          Painel da clínica
        </h1>
        <p className="form-alert" role="alert">
          Não foi possível carregar o perfil da clínica. Tente de novo em
          instantes.
        </p>
        <SignOutButton />
      </section>
    );
  }

  const { profile } = props;
  return (
    <section className="clinic-page" aria-labelledby="panel-title">
      <p className="eyebrow">Painel da clínica</p>
      <h1 id="panel-title" className="clinic-title">
        {profile.name}
      </h1>
      <nav aria-label="Gestão da clínica">
        <Link href="/clinica/vagas">Vagas e reservas</Link>
      </nav>
      <div className="clinic-form">
        <section className="form-group" aria-labelledby="profile-title">
          <h2 id="profile-title">Perfil</h2>
          <dl className="profile">
            <dt>Endereço</dt>
            <dd>{profile.address}</dd>
            <dt>CNES</dt>
            <dd>{profile.cnes}</dd>
            <dt>Responsável técnico</dt>
            <dd>{profile.technicalManager}</dd>
          </dl>
        </section>
        <section className="form-group" aria-labelledby="hours-title">
          <h2 id="hours-title">Expediente</h2>
          <table className="hours">
            <caption className="sr-only">
              Expediente por dia da semana, hora de São Paulo
            </caption>
            <tbody>
              {WEEKDAYS.map(({ weekday, label }) => {
                const ranges = profile.openingHours.filter(
                  (range) => range.weekday === weekday,
                );
                return (
                  <tr key={weekday}>
                    <th scope="row">{label}</th>
                    {ranges.length ? (
                      <td>
                        {ranges
                          .map(
                            (range) =>
                              `${formatMinutes(range.startMinute)} às ${formatMinutes(range.endMinute)}`,
                          )
                          .join(', ')}
                      </td>
                    ) : (
                      <td className="closed">Fechado</td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
        <SignOutButton />
      </div>
    </section>
  );
}
