package com.custom.plugin;

import sailpoint.api.SailPointContext;
import sailpoint.object.Identity;
import sailpoint.object.Filter;
import sailpoint.object.QueryOptions;
import sailpoint.rest.plugin.BasePluginResource;
import sailpoint.rest.plugin.AllowAll;
import sailpoint.tools.GeneralException;

import javax.ws.rs.*;
import javax.ws.rs.core.MediaType;
import javax.ws.rs.core.Response;
import java.util.*;

/**
 * REST resource for the Multi-User Search plugin.
 *
 * Endpoint:  POST /plugin/rest/multi-user-search/resolve
 * Payload:   { "identities": "jsmith, Jane Doe, mjones@company.com" }
 *
 * Resolution chain per token:
 *   1. Exact match on Identity.name  (username / login)
 *   2. Case-insensitive displayName
 *   3. Case-insensitive email
 *   4. Case-insensitive employeeId
 *   5. Partial displayName (only if exactly one hit)
 *
 * Replace @AllowAll with @RequiredRight("ViewRequestAccess") for tighter control.
 */
@Path("multi-user-search")
@Consumes(MediaType.APPLICATION_JSON)
@Produces(MediaType.APPLICATION_JSON)
@AllowAll
public class MultiUserSearchResource extends BasePluginResource {

    /** Maximum identities per single request — prevents abuse. */
    private static final int MAX_TOKENS = 200;

    @Override
    public String getPluginName() {
        return "MultiUserSearchPlugin";
    }

    // ─────────────────────────────────────────────────────
    //  POST /plugin/rest/multi-user-search/resolve
    // ─────────────────────────────────────────────────────
    @POST
    @Path("resolve")
    public Response resolveIdentities(Map<String, Object> payload) {

        List<Map<String, String>> found   = new ArrayList<>();
        List<String>              missing = new ArrayList<>();
        Set<String>               seen    = new HashSet<>();  // deduplicate

        try {
            SailPointContext ctx = getContext();
            String raw = (String) payload.get("identities");

            if (raw == null || raw.trim().isEmpty()) {
                return Response.ok(
                    Collections.singletonMap("error", "No input provided")
                ).build();
            }

            // Split on comma, semicolon, or newline
            String[] tokens = raw.split("[,;\\r?\\n]+");

            if (tokens.length > MAX_TOKENS) {
                return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Collections.singletonMap(
                        "error",
                        "Maximum " + MAX_TOKENS + " identities per request. You sent " + tokens.length + "."
                    )).build();
            }

            for (String token : tokens) {
                token = token.trim();
                if (token.isEmpty()) continue;

                Identity id = resolveIdentity(ctx, token);

                if (id != null && !seen.contains(id.getId())) {
                    seen.add(id.getId());
                    Map<String, String> entry = new LinkedHashMap<>();
                    entry.put("id",          id.getId());
                    entry.put("name",        safe(id.getName()));
                    entry.put("displayName", safe(id.getDisplayName()));
                    entry.put("firstname",   safe(id.getFirstname()));
                    entry.put("lastname",    safe(id.getLastname()));
                    entry.put("email",       safe(id.getEmail()));
                    entry.put("department",  safe(id.getDepartment()));
                    entry.put("manager",     id.getManager() != null
                                                 ? safe(id.getManager().getDisplayName()) : "");
                    entry.put("status",      id.isInactive() ? "Inactive" : "Active");
                    found.add(entry);
                } else if (id == null) {
                    missing.add(token);
                }
                // duplicate ids silently ignored
            }
        } catch (GeneralException e) {
            return Response.serverError()
                .entity(Collections.singletonMap("error", e.getMessage()))
                .build();
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("found",    found);
        result.put("notFound", missing);
        result.put("total",    found.size() + missing.size());
        return Response.ok(result).build();
    }

    // ─────────────────────────────────────────────────────
    //  GET /plugin/rest/multi-user-search/health
    //  Quick smoke test endpoint.
    // ─────────────────────────────────────────────────────
    @GET
    @Path("health")
    public Response health() {
        Map<String, Object> info = new LinkedHashMap<>();
        info.put("status", "ok");
        info.put("plugin", getPluginName());
        info.put("version", "1.0");
        info.put("maxTokens", MAX_TOKENS);
        return Response.ok(info).build();
    }

    // ─────────────────────────────────────────────────────
    //  Resolution chain
    // ─────────────────────────────────────────────────────
    private Identity resolveIdentity(SailPointContext ctx, String token)
            throws GeneralException {

        // 1) Exact match on Identity.name (username)
        Identity id = ctx.getObjectByName(Identity.class, token);
        if (id != null) return id;

        // 2) Case-insensitive displayName
        id = findSingle(ctx, Filter.ignoreCase(Filter.eq("displayName", token)));
        if (id != null) return id;

        // 3) Case-insensitive email
        id = findSingle(ctx, Filter.ignoreCase(Filter.eq("email", token)));
        if (id != null) return id;

        // 4) Case-insensitive employeeId
        id = findSingle(ctx, Filter.ignoreCase(Filter.eq("employeeId", token)));
        if (id != null) return id;

        // 5) Partial displayName — only if exactly one match (avoids ambiguity)
        QueryOptions qo = new QueryOptions();
        qo.addFilter(Filter.ignoreCase(
            Filter.like("displayName", token, Filter.MatchMode.ANYWHERE)
        ));
        qo.setResultLimit(2);  // only need to know if >1
        List<Identity> hits = ctx.getObjects(Identity.class, qo);
        if (hits != null && hits.size() == 1) return hits.get(0);

        return null;
    }

    /** Run a filter expecting exactly one result. */
    private Identity findSingle(SailPointContext ctx, Filter filter)
            throws GeneralException {
        QueryOptions qo = new QueryOptions();
        qo.addFilter(filter);
        qo.setResultLimit(1);
        List<Identity> hits = ctx.getObjects(Identity.class, qo);
        return (hits != null && !hits.isEmpty()) ? hits.get(0) : null;
    }

    private static String safe(String s) {
        return s != null ? s : "";
    }
}
