-- ============================================
-- SCRIPT 1: VINCULAR ALUNOS AOS PROFESSORES
-- ============================================
-- Antes de rodar, decida:
-- aluno1 -> professor1? professor2?
-- aluno2 -> professor1? professor2?
-- ============================================

BEGIN;

-- 1. Mostrar situação atual
SELECT 'ANTES' AS momento, s.id AS student_id, s.name AS student_name, 
       s.user_id AS current_user_id, u.name AS current_user_name
FROM students s
LEFT JOIN users u ON u.id = s.user_id
ORDER BY s.name;

-- 2. ALUNO1 -> qual professor?
-- Troque o UUID abaixo pelo ID do professor escolhido
UPDATE students 
SET user_id = '1d8ae0-bfa9-4960-9315-514d3b49af7d' -- COLOQUE AQUI O ID DO PROFESSOR
WHERE id = 'ca15f331-ac78-417c-9630-6e0b6d427b53';

-- 3. ALUNO2 -> qual professor?
-- Troque o UUID abaixo pelo ID do professor escolhido
UPDATE students 
SET user_id = '1d8ae0-bfa9-4960-9315-514d3b49af7d' -- COLOQUE AQUI O ID DO PROFESSOR
WHERE id = 'bc1fc0ab-4579-405b-ad92-b1f9b229784d';

-- 4. Mostrar resultado depois
SELECT 'DEPOIS' AS momento, s.id AS student_id, s.name AS student_name, 
       s.user_id AS new_user_id, u.name AS new_professor_name
FROM students s
LEFT JOIN users u ON u.id = s.user_id
ORDER BY s.name;

COMMIT;

-- ============================================
-- SCRIPT 2: VIEW DO DASHBOARD DO PROFESSOR
-- ============================================
-- Cria uma view que retorna apenas os alunos
-- vinculados ao professor logado.
-- A aplicação deve passar o UUID do professor
-- como parâmetro na consulta.
-- ============================================

-- IDs para referência:
-- professor1: 1d8ae0-bfa9-4960-9315-514d3b49af7d
-- professor2: 5dd89674-d35e-49d4-9fae-563129c76f05
-- aluno1: ca15f331-ac78-417c-9630-6e0b6d427b53
-- aluno2: bc1fc0ab-4579-405b-ad92-b1f9b229784d

BEGIN;

-- Remove a view se já existir para recriar
DROP VIEW IF EXISTS vw_professor_students;

-- Cria view que lista alunos por professor
CREATE VIEW vw_professor_students AS
SELECT 
    s.id AS student_id,
    s.name AS student_name,
    s.email AS student_email,
    s.user_id AS professor_id,
    u.name AS professor_name,
    u.email AS professor_email
FROM students s
LEFT JOIN users u ON u.id = s.user_id
WHERE s.user_id IS NOT NULL;

COMMIT;

-- ============================================
-- EXEMPLOS DE CONSULTA NO DASHBOARD
-- ============================================

-- Listar alunos do professor1
-- SELECT * FROM vw_professor_students
-- WHERE professor_id = '1d8ae0-bfa9-4960-9315-514d3b49af7d';

-- Listar alunos do professor2
-- SELECT * FROM vw_professor_students
-- WHERE professor_id = '5dd89674-d35e-49d4-9fae-563129c76f05';

-- Contar alunos por professor
-- SELECT professor_id, professor_name, COUNT(*) AS total_alunos
-- FROM vw_professor_students
-- GROUP BY professor_id, professor_name
-- ORDER BY total_alunos DESC;
