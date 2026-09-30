-- Seed for scripts\verify-disbursement-migration.cmd
--
-- Four disbursements covering every status, plus one requested by a user whose
-- role is NOT one of the seven licensed roles, so the migration's refusal to
-- invent a role_type is exercised rather than assumed.
INSERT INTO users (name, username, email, password, role_type, created_at, updated_at)
VALUES ('Notary',   'bn1', 'bn1@x.test', 'x', 'notaris', NOW(), NOW()),
       ('Owner',    'bo1', 'bo1@x.test', 'x', 'user',     NOW(), NOW()),
       ('Client',   'bc1', 'bc1@x.test', 'x', 'user',     NOW(), NOW());

INSERT INTO projects (title, user_id, budget, status, created_at, updated_at)
VALUES ('B9 project', 2, 500000000, 'in_progress', NOW(), NOW());

INSERT INTO project_disbursements
    (project_id, requested_by, title, purpose, amount, status,
     verified_by, verified_at, verification_notes, created_at, updated_at)
VALUES
    (1, 1, 'PNBP',         'Land registration PNBP fees',  5500000, 'verified',
     2, NOW(), 'checked against receipt', NOW(), NOW()),
    (1, 1, 'BPHTB',        'Estimated tax',              45000000, 'pending',
     NULL, NULL, NULL, NOW(), NOW()),
    (1, 1, 'Rejected One', 'Something we said no to',      1000000, 'rejected',
     2, NOW(), 'missing receipt', NOW(), NOW()),
    (1, 3, 'Not A Pro',    'Requested by a non-professional', 750000, 'pending',
     NULL, NULL, NULL, NOW(), NOW());
