'use client';

import type { Exam, ExamCatalogItem } from '@hackathon/contracts';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { centsToReais, minutesToHours } from '../exam-form-values';
import { ExamForm } from './exam-form';

interface Notice {
  text: string;
  tone: 'success' | 'alert';
}

/** Lista de exames da clínica e o formulário (cadastro ou edição) que a atualiza. */
export function ExamsWorkspace({
  exams,
  catalog,
}: {
  exams: Exam[];
  catalog: ExamCatalogItem[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Exam | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [notice, setNotice] = useState<Notice | null>(null);

  const backToCreate = (next: Notice | null) => {
    setEditing(null);
    setFormKey((key) => key + 1);
    setNotice(next);
  };

  return (
    <div className="clinic-form">
      <section className="form-group" aria-labelledby="exam-list-title">
        <h2 id="exam-list-title" className="form-title">
          Exames cadastrados
        </h2>
        {exams.length === 0 ? (
          <p className="empty">Nenhum exame cadastrado ainda.</p>
        ) : (
          <table className="exam-table">
            <thead>
              <tr>
                <th scope="col">Exame</th>
                <th scope="col">Preço cheio</th>
                <th scope="col">Piso</th>
                <th scope="col">Degraus</th>
                <th scope="col">X / Y</th>
                <th scope="col">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {exams.map((exam) => (
                <tr key={exam.id}>
                  <th scope="row">
                    {exam.name}
                    <span className="field-hint"> TUSS {exam.tussCode}</span>
                  </th>
                  <td>R$ {centsToReais(exam.fullPriceCents)}</td>
                  <td>R$ {centsToReais(exam.floorPriceCents)}</td>
                  <td>
                    {exam.priceSteps
                      .map(
                        (step) =>
                          `${minutesToHours(step.leadMinutes)} h · ${step.discountPercent}%`,
                      )
                      .join(', ')}
                  </td>
                  <td>
                    {exam.toleranceMinutes} / {exam.maxTravelMinutes} min
                  </td>
                  <td>
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => {
                        setNotice(null);
                        setEditing(exam);
                      }}
                    >
                      Editar<span className="sr-only"> {exam.name}</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {notice ? (
        <p
          className={notice.tone === 'alert' ? 'form-alert' : 'form-success'}
          role={notice.tone === 'alert' ? 'alert' : 'status'}
        >
          {notice.text}
        </p>
      ) : null}

      <ExamForm
        key={editing ? `edit-${editing.id}` : `new-${formKey}`}
        catalog={catalog}
        editing={editing}
        onSaved={(text) => {
          backToCreate({ text, tone: 'success' });
          router.refresh();
        }}
        onNotFound={(text) => {
          backToCreate({ text, tone: 'alert' });
          router.refresh();
        }}
        onCancel={() => backToCreate(null)}
      />
    </div>
  );
}
