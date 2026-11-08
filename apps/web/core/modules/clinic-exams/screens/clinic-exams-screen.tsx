import type {
  ClinicSettings,
  Exam,
  ExamCatalogItem,
} from '@hackathon/contracts';
import Link from 'next/link';
import ClinicPanelScreen from '../../clinic/screens/clinic-panel-screen';
import { ExamsWorkspace } from '../components/exams-workspace';
import { SettingsForm } from '../components/settings-form';

type Props =
  | { kind: 'not-clinic' }
  | {
      kind: 'page';
      exams: Exam[];
      catalog: ExamCatalogItem[];
      settings: ClinicSettings;
    }
  | { kind: 'error' };

export default function ClinicExamsScreen(props: Props) {
  if (props.kind === 'not-clinic')
    return <ClinicPanelScreen kind="not-clinic" />;

  if (props.kind === 'error') {
    return (
      <section
        className="clinic-page clinic-narrow"
        aria-labelledby="exams-title"
      >
        <h1 id="exams-title" className="clinic-title">
          Exames
        </h1>
        <p className="form-alert" role="alert">
          Não foi possível carregar os exames. Tente de novo em instantes.
        </p>
        <Link href="/clinica">Voltar ao painel</Link>
      </section>
    );
  }

  return (
    <section className="clinic-page exams-page" aria-labelledby="exams-title">
      <p className="eyebrow">
        <Link href="/clinica">Painel da clínica</Link> · Exames
      </p>
      <h1 id="exams-title" className="clinic-title">
        Exames oferecidos
      </h1>
      <p className="intro">
        Cadastre os exames de imagem que a clínica oferece nas vagas de encaixe,
        com preço cheio, piso e os degraus de desconto por antecedência.
      </p>
      <ExamsWorkspace exams={props.exams} catalog={props.catalog} />
      <SettingsForm settings={props.settings} />
    </section>
  );
}
