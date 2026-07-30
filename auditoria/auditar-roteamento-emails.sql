-- AUDITORIA SOMENTE LEITURA — FUNCIONAL UP DIGITAL
-- Não altera nenhum dado.

-- 1. Alunos cujo user_id aponta para usuário que não é professor ativo.
SELECT
  s.id AS student_id,
  s.name AS student_name,
  s.user_id AS linked_user_id,
  u.name AS linked_user_name,
  u.email AS linked_user_email,
  u.role AS linked_user_role,
  u.active AS linked_user_active
FROM students s
LEFT JOIN users u ON u.id = s.user_id
WHERE u.id IS NULL
   OR u.active IS DISTINCT FROM TRUE
   OR UPPER(COALESCE(u.role, '')) NOT IN ('PROFESSOR', 'TEACHER')
ORDER BY s.name;

-- 2. Contratos com professor inválido ou inativo.
SELECT
  sc.id AS contract_id,
  s.name AS student_name,
  sc.professor_id,
  u.name AS professor_name,
  u.email AS professor_email,
  u.role AS professor_role,
  u.active AS professor_active,
  sc.status,
  sc.start_date,
  sc.end_date
FROM student_contracts sc
JOIN students s ON s.id = sc.student_id
LEFT JOIN users u ON u.id = sc.professor_id
WHERE sc.professor_id IS NOT NULL
  AND (
    u.id IS NULL
    OR u.active IS DISTINCT FROM TRUE
    OR UPPER(COALESCE(u.role, '')) NOT IN ('PROFESSOR', 'TEACHER')
  )
ORDER BY sc.created_at DESC;

-- 3. Conversas direcionadas a usuário que não é professor ativo.
SELECT
  q.id AS conversation_id,
  s.name AS student_name,
  q.teacher_id,
  u.name AS recipient_name,
  u.email AS recipient_email,
  u.role AS recipient_role,
  u.active AS recipient_active,
  q.created_at
FROM questions q
LEFT JOIN students s ON s.id = q.student_id
LEFT JOIN users u ON u.id = q.teacher_id
WHERE q.parent_id IS NULL
  AND q.teacher_id IS NOT NULL
  AND (
    u.id IS NULL
    OR u.active IS DISTINCT FROM TRUE
    OR UPPER(COALESCE(u.role, '')) NOT IN ('PROFESSOR', 'TEACHER')
  )
ORDER BY q.created_at DESC;

-- 4. Eventos de cuidado associados a usuário que não é professor ativo.
SELECT
  sce.id AS event_id,
  s.name AS student_name,
  sce.professor_id,
  u.name AS recipient_name,
  u.email AS recipient_email,
  u.role AS recipient_role,
  u.active AS recipient_active,
  sce.event_type,
  sce.status,
  sce.created_at
FROM student_care_events sce
JOIN students s ON s.id = sce.student_id
LEFT JOIN users u ON u.id = sce.professor_id
WHERE sce.professor_id IS NOT NULL
  AND (
    u.id IS NULL
    OR u.active IS DISTINCT FROM TRUE
    OR UPPER(COALESCE(u.role, '')) NOT IN ('PROFESSOR', 'TEACHER')
  )
ORDER BY sce.created_at DESC;

-- 5. Lista de destinatários ativos por papel para conferência.
SELECT id, name, email, role, active
FROM users
WHERE active = TRUE
  AND UPPER(COALESCE(role, '')) IN ('PROFESSOR', 'TEACHER', 'GESTOR', 'ADMIN')
ORDER BY role, name;
