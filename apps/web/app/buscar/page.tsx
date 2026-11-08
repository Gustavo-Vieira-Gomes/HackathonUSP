import Link from 'next/link';
import { searchClinics } from '@/core/modules/clinics/services/clinics.service';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Buscar clínicas | Hackathon USP' };

const currency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const params = await searchParams;
  const q = typeof params.q === 'string' ? params.q : '';
  const result = await searchClinics(q);

  return (
    <main className="clinic-search">
      <header className="masthead">
        <Link className="brand" href="/" aria-label="Hackathon USP, início">
          <span className="brand-mark" aria-hidden="true">
            H.
          </span>
          Hackathon USP
        </Link>
      </header>
      <section className="search-intro" aria-labelledby="search-title">
        <h1 id="search-title">Buscar clínicas</h1>
        <p className="intro">Conheça os exames das clínicas de São Paulo.</p>
        <p className="demo-notice">
          Demonstração: os estabelecimentos são referências geográficas reais.
          Preços e disponibilidade são fictícios e não representam ofertas ou
          parceria com as clínicas.
        </p>
        <form action="/buscar" method="get" className="clinic-search-form">
          <label htmlFor="clinic-name">Nome da clínica</label>
          <div className="search-controls">
            <input
              id="clinic-name"
              name="q"
              type="search"
              maxLength={120}
              defaultValue={q}
            />
            <button className="primary-link" type="submit">
              Buscar
            </button>
          </div>
        </form>
      </section>
      <section className="search-results" aria-labelledby="results-title">
        <h2 id="results-title">Resultados da busca</h2>
        {result.status === 'error' ? (
          <div role="alert" className="card">
            <h3>Busca indisponível neste momento</h3>
            <p>
              Não foi possível consultar as clínicas. Tente buscar novamente em
              alguns instantes.
            </p>
          </div>
        ) : result.status === 'invalid' ? (
          <p role="alert">Use até 120 caracteres no nome da clínica.</p>
        ) : (
          <>
            <p role="status">
              {result.clinics.length}{' '}
              {result.clinics.length === 1
                ? 'clínica encontrada'
                : 'clínicas encontradas'}
            </p>
            {result.clinics.length === 0 ? (
              <p>
                Nenhuma clínica corresponde à busca. Tente outro nome ou{' '}
                <Link href="/buscar">veja todas as clínicas</Link>.
              </p>
            ) : (
              <ul className="clinic-list">
                {result.clinics.map((clinic) => (
                  <li key={clinic.id}>
                    <article className="card">
                      <h3>{clinic.name}</h3>
                      <p>{clinic.address}</p>
                      <h4>Exames e preços demonstrativos</h4>
                      <ul className="exam-list">
                        {clinic.exams.map((exam) => (
                          <li key={exam.id}>
                            <span>{exam.name}</span>
                            <span>
                              Preço cheio:{' '}
                              {currency.format(exam.fullPriceCents / 100)} ·
                              Piso:{' '}
                              {currency.format(exam.floorPriceCents / 100)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </article>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>
    </main>
  );
}
