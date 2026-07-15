"use client";

interface Props {
  objective: string;
  focusAreas: string;
  intensity: string;
  duration: string;
  caloriesMin: string;
  caloriesMax: string;
  studentSummary: string;
  safetyNote: string;
  onObjectiveChange: (value: string) => void;
  onFocusAreasChange: (value: string) => void;
  onIntensityChange: (value: string) => void;
  onDurationChange: (value: string) => void;
  onCaloriesMinChange: (value: string) => void;
  onCaloriesMaxChange: (value: string) => void;
  onStudentSummaryChange: (value: string) => void;
  onSafetyNoteChange: (value: string) => void;
}

export default function SmartWorkoutSummary(props: Props) {
  return (
    <section className="rounded-xl border border-[#ffffff10] bg-[#111111] p-5">
      <h2 className="text-lg font-semibold text-[#D4A373]">
        ✨ Resumo inteligente para o aluno
      </h2>
      <p className="mt-2 text-xs leading-relaxed text-[#a1a1a1]">
        Este bloco aparece para o aluno junto com o treino. Use linguagem simples,
        acolhedora e objetiva. O gasto energético deve ser apresentado como faixa
        estimada, nunca como promessa.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="mb-1 block text-sm text-[#e5e5e5]">Objetivo da sessão</label>
          <input value={props.objective} onChange={(e) => props.onObjectiveChange(e.target.value)} placeholder="Ex: melhorar resistência muscular e retomar consistência" className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5]" />
        </div>
        <div>
          <label className="mb-1 block text-sm text-[#e5e5e5]">Foco do treino</label>
          <input value={props.focusAreas} onChange={(e) => props.onFocusAreasChange(e.target.value)} placeholder="Ex: pernas, glúteos, core e condicionamento" className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5]" />
        </div>
        <div>
          <label className="mb-1 block text-sm text-[#e5e5e5]">Intensidade esperada</label>
          <select value={props.intensity} onChange={(e) => props.onIntensityChange(e.target.value)} className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5]">
            <option value="">Selecione...</option><option value="Leve">Leve</option><option value="Moderada">Moderada</option><option value="Alta">Alta</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm text-[#e5e5e5]">Duração estimada em minutos</label>
          <input type="number" min="5" max="180" value={props.duration} onChange={(e) => props.onDurationChange(e.target.value)} placeholder="Ex: 40" className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5]" />
        </div>
        <div>
          <label className="mb-1 block text-sm text-[#e5e5e5]">Gasto estimado em kcal</label>
          <div className="grid grid-cols-2 gap-2">
            <input type="number" min="0" max="2000" value={props.caloriesMin} onChange={(e) => props.onCaloriesMinChange(e.target.value)} placeholder="mín." className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5]" />
            <input type="number" min="0" max="2000" value={props.caloriesMax} onChange={(e) => props.onCaloriesMaxChange(e.target.value)} placeholder="máx." className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5]" />
          </div>
          <p className="mt-1 text-[10px] text-[#6b6b6b]">Exiba como faixa estimada. Evite número exato.</p>
        </div>
        <div className="md:col-span-2">
          <label className="mb-1 block text-sm text-[#e5e5e5]">Resumo para o aluno</label>
          <textarea value={props.studentSummary} onChange={(e) => props.onStudentSummaryChange(e.target.value)} rows={3} placeholder="Ex: O foco de hoje é fazer bem feito, manter constância e terminar com sensação de evolução." className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5]" />
        </div>
        <div className="md:col-span-2">
          <label className="mb-1 block text-sm text-[#e5e5e5]">Observação de segurança</label>
          <textarea value={props.safetyNote} onChange={(e) => props.onSafetyNoteChange(e.target.value)} rows={2} placeholder="Ex: Se sentir dor ou desconforto fora do esperado, pare e avise o professor." className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-4 py-3 text-sm text-[#f5f5f5]" />
        </div>
      </div>
    </section>
  );
}
