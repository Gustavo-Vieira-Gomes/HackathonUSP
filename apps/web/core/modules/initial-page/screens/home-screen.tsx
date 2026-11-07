import Link from 'next/link';
import { isApiAvailable } from '@/core/shared/services/api-health.service';

export default async function HomeScreen() {
  const apiAvailable = await isApiAvailable();

  return (
    <main>
      <header className="masthead">
        <Link className="brand" href="/" aria-label="Hackathon USP, início">
          <span className="brand-mark" aria-hidden="true">
            H.
          </span>
          Hackathon USP
        </Link>
        <span className="edition">Da ideia à entrega</span>
      </header>

      <section className="hero" aria-labelledby="headline">
        <p className="eyebrow">Um começo. Muitas possibilidades.</p>
        <h1 id="headline">
          O próximo passo
          <br />
          começa aqui<span>.</span>
        </h1>
        <p className="intro">
          A base está pronta. Agora vamos escolher um problema real, construir a
          solução e colocar a ideia à prova.
        </p>
        <a className="primary-link" href="#foundation">
          Conhecer a base <span aria-hidden="true">↗</span>
        </a>
      </section>

      <section
        className="foundation"
        id="foundation"
        aria-labelledby="foundation-title"
      >
        <div className="section-heading">
          <p className="eyebrow">Ponto de partida</p>
          <h2 id="foundation-title">Espaço para construir.</h2>
        </div>
        <div className="cards">
          <article className="card">
            <span className="card-number">01</span>
            <h3>Uma experiência completa</h3>
            <p>
              Uma interface preparada para receber os primeiros fluxos do
              produto.
            </p>
          </article>
          <article className="card">
            <span className="card-number">02</span>
            <h3>Conexões verificáveis</h3>
            <p>
              A comunicação com a API já tem um primeiro ponto de verificação.
            </p>
            <span
              className={`status ${apiAvailable ? 'available' : 'unavailable'}`}
            >
              <span className="status-dot" aria-hidden="true" />
              {apiAvailable
                ? 'API conectada'
                : 'API indisponível neste momento'}
            </span>
          </article>
          <article className="card">
            <span className="card-number">03</span>
            <h3>Próxima decisão: o problema</h3>
            <p>
              O escopo está em aberto. A primeira entrega será um fluxo útil de
              ponta a ponta.
            </p>
          </article>
        </div>
      </section>
      <footer>
        Hackathon USP <span>Construir · Validar · Evoluir</span>
      </footer>
    </main>
  );
}
