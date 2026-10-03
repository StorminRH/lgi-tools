-- The SDE refresh replaces these four datasets through emitIndustryRules.
-- Extend the existing runtime role's table-scoped TRUNCATE grant to them only.
GRANT TRUNCATE ON
	public.industry_target_filters,
	public.industry_modifiers,
	public.industry_assembly_lines,
	public.industry_installation_types
TO lgi_runtime;
