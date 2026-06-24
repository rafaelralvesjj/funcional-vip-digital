"use client";
import { useEffect, useState } from "react";
interface Student {
id: string;
name: string;
email?: string;
image?: string;
}
interface LibraryExercise {
id: string;
name: string;
description: string;
muscleGroup: string;
imageUrl?: string;
}
interface ExerciseItem {
name: string;
description: string;
series: number;
reps: string;
weight: string;
restTime: string;
notes: string;
order: number;
imageUrl?: string;
videoUrl?: string;
}
export default function MontarTreinoPage() {
const [students, setStudents] = useState<Student[]>([]);
const [library, setLibrary] = useState<LibraryExercise[]>([]);
const [filteredLibrary, setFilteredLibrary] = useState<LibraryExercise[]>([]);
const [searchTerm, setSearchTerm] = useState("");
const [selectedStudent, setSelectedStudent] = useState("");
const [planName, setPlanName] = useState("");
const [weekDay, setWeekDay] = useState("");
const [description, setDescription] = useState("");
const [notes, setNotes] = useState("");
const [exercises, setExercises] = useState<ExerciseItem[]>([]);
const [loading, setLoading] = useState(false);
const [saving, setSaving] = useState(false);
const [success, setSuccess] = useState(false);
const [showLibrary, setShowLibrary] = useState(false);
useEffect(() => {
fetchStudents();
fetchLibrary();
}, []);
useEffect(() => {
if (searchTerm.trim()) {
const term = searchTerm.toLowerCase();
setFilteredLibrary(
library.filter(
(ex) =>
ex.name.toLowerCase().includes(term) ||
ex.muscleGroup.toLowerCase().includes(term)
)
);
} else {
setFilteredLibrary(library);
}
}, [searchTerm, library]);
async function fetchStudents() {
try {
const res = await fetch("/api/student");
if (res.ok) {
const data = await res.json();
setStudents(data.students || data || []);
}
} catch {}
}
async function fetchLibrary() {
try {
const res = await fetch("/api/exercise-library");
if (res.ok) {
const data = await res.json();
setLibrary(data.exercises || []);
setFilteredLibrary(data.exercises || []);
}
} catch {}
}
function addExercise(ex: LibraryExercise) {
const newExercise: ExerciseItem = {
name: ex.name,
description: ex.description,
series: 3,
reps: "10",
weight: "",
restTime: "60s",
notes: "",
order: exercises.length,
imageUrl: ex.imageUrl,
videoUrl: (ex as any).videoUrl,
};
setExercises([...exercises, newExercise]);
setShowLibrary(false);
}
function removeExercise(index: number) {
const updated = exercises.filter((_, i) => i !== index);
setExercises(updated.map((ex, i) => ({ ...ex, order: i })));
}
function moveExercise(fromIndex: number, direction: "up" | "down") {
const toIndex = direction === "up" ? fromIndex - 1 : fromIndex + 1;
if (toIndex < 0 || toIndex >= exercises.length) return;
const updated = [...exercises];
[updated[fromIndex], updated[toIndex]] = [updated[toIndex], updated[fromIndex]];
setExercises(updated.map((ex, i) => ({ ...ex, order: i })));
}
function updateExercise(index: number, field: keyof ExerciseItem, value: any) {
const updated = [...exercises];
(updated[index] as any)[field] = value;
setExercises(updated);
}
async function handleSubmit(e: React.FormEvent) {
e.preventDefault();
if (!selectedStudent || !planName.trim() || exercises.length === 0) return;
setSaving(true);
setSuccess(false);
try {
const res = await fetch("/api/workout-plan", {
method: "POST",
headers: { "Content-Type": "application/json" },
body: JSON.stringify({
studentId: selectedStudent,
name: planName.trim(),
description: description || null,
weekDay: weekDay || null,
notes: notes || null,
exercises: exercises.map((ex) => ({
name: ex.name,
description: ex.description,
series: ex.series,
reps: ex.reps || null,
weight: ex.weight || null,
restTime: ex.restTime || null,
notes: ex.notes || null,
order: ex.order,
imageUrl: ex.imageUrl || null,
videoUrl: ex.videoUrl || null,
})),
}),
});
if (res.ok) {
setSuccess(true);
setPlanName("");
setWeekDay("");
setDescription("");
setNotes("");
setExercises([]);
setTimeout(() => setSuccess(false), 3000);
} else {
const err = await res.json();
alert("Erro ao salvar: " + (err.error || "erro desconhecido"));
}
} catch {
alert("Erro de conexao ao salvar treino");
}
setSaving(false);
}
return (
<div className="min-h-screen bg-[#0a0a0a] text-[#f5f5f5] p-4 md:p-6">
<div className="max-w-4xl mx-auto space-y-6"></div>
</div>
);
}
