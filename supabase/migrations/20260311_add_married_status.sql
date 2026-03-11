-- Add 'married' to the relationship_status check constraint
ALTER TABLE profiles DROP CONSTRAINT profiles_relationship_status_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_relationship_status_check
  CHECK (relationship_status IN ('single', 'in_a_relationship', 'married', 'its_complicated'));
