/**
 * ============================================================================
 *  Multi-User Comma-Separated Search Widget
 *  SailPoint IdentityIQ Plugin Snippet
 * ============================================================================
 *
 *  Injected on every page via the plugin snippet mechanism.
 *  Activates ONLY on the LCM Request Access page.
 *
 *  Users can paste comma / semicolon / newline-separated identities
 *  (usernames, display names, emails, employee IDs) and resolve them
 *  in bulk via the plugin REST endpoint, then push the results into
 *  the OOB identity selection list.
 *
 * ============================================================================
 */
(function () {
    'use strict';

    // ──────────────────────────────────────────
    //  CONFIGURATION  (edit these for your env)
    // ──────────────────────────────────────────

    var CONFIG = {
        /** REST endpoint registered by the plugin */
        restUrl: '/identityiq/plugin/rest/multi-user-search/resolve',

        /** URL fragments that identify the Request Access page */
        pagePatterns: [
            '/lcm/requestAccess',
            '#/requestAccess',
            'accessRequest',
            'manageAccess/requestAccess'
        ],

        /** CSS selectors for the page container the widget is injected into */
        containerSelectors: [
            '.lcm-request-access',
            '#accessRequestForm',
            '[class*="request-access"]',
            '.card-request-access',
            '.spMainContent'
        ].join(', '),

        /** CSS selectors for the OOB identity search input (for typeahead fallback) */
        searchInputSelectors: [
            'input[ng-model*="identity"]',
            'input[ng-model*="searchText"]',
            'input.identity-search-input',
            'input[placeholder*="Search"]',
            'input[placeholder*="search"]'
        ].join(', '),

        /** Timing */
        pollInterval:  600,   // ms between container checks
        maxPolls:       40,   // give up after ~24 s
        typeaheadDelay: 800,  // ms to wait for typeahead dropdown
        betweenUsers:   900   // ms between sequential user injections
    };


    // ──────────────────────────────────────────
    //  PAGE DETECTION
    // ──────────────────────────────────────────

    function isTargetPage() {
        var loc = window.location.href;
        for (var i = 0; i < CONFIG.pagePatterns.length; i++) {
            if (loc.indexOf(CONFIG.pagePatterns[i]) !== -1) return true;
        }
        return false;
    }

    function waitForContainer(callback) {
        var polls = 0;
        var timer = setInterval(function () {
            polls++;
            var el = document.querySelector(CONFIG.containerSelectors);
            if (el)            { clearInterval(timer); callback(el); }
            if (polls >= CONFIG.maxPolls) clearInterval(timer);
        }, CONFIG.pollInterval);
    }

    function init() {
        if (!isTargetPage()) return;
        waitForContainer(injectWidget);
    }

    // Re-check on SPA route changes
    var observer = new MutationObserver(function () { init(); });
    observer.observe(document.body, { childList: true, subtree: true });
    init();


    // ──────────────────────────────────────────
    //  WIDGET HTML
    // ──────────────────────────────────────────

    function injectWidget(container) {
        if (document.getElementById('mus-widget')) return;

        var widget = document.createElement('div');
        widget.id = 'mus-widget';
        widget.innerHTML = [
            '<div class="mus-panel">',
            '  <div class="mus-header">',
            '    <span class="mus-title">&#128269; Bulk Identity Lookup</span>',
            '    <span class="mus-subtitle">',
            '      Paste usernames, display names, emails, or employee IDs — separated by commas, semicolons, or newlines.',
            '    </span>',
            '  </div>',
            '',
            '  <div class="mus-input-row">',
            '    <textarea id="musInput" rows="4"',
            '      placeholder="jsmith, Jane Doe, mjones@company.com, 100234&#10;You can also paste from Excel — one per line."></textarea>',
            '    <div class="mus-btn-col">',
            '      <button id="musResolveBtn" class="btn btn-primary" type="button">',
            '        Resolve',
            '      </button>',
            '      <button id="musClearBtn" class="btn btn-default btn-sm" type="button">',
            '        Clear',
            '      </button>',
            '    </div>',
            '  </div>',
            '',
            '  <div id="musStatus"></div>',
            '  <div id="musResults"></div>',
            '</div>'
        ].join('\n');

        container.insertBefore(widget, container.firstChild);

        document.getElementById('musResolveBtn').addEventListener('click', doResolve);
        document.getElementById('musClearBtn').addEventListener('click', doClear);

        // Ctrl+Enter to resolve
        document.getElementById('musInput').addEventListener('keydown', function (e) {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                doResolve();
            }
        });
    }


    // ──────────────────────────────────────────
    //  CLEAR
    // ──────────────────────────────────────────

    function doClear() {
        document.getElementById('musInput').value   = '';
        document.getElementById('musResults').innerHTML = '';
        document.getElementById('musStatus').innerHTML  = '';
    }


    // ──────────────────────────────────────────
    //  RESOLVE  — call the plugin REST endpoint
    // ──────────────────────────────────────────

    function doResolve() {
        var input      = document.getElementById('musInput').value;
        var statusDiv  = document.getElementById('musStatus');
        var resultsDiv = document.getElementById('musResults');
        var btn        = document.getElementById('musResolveBtn');

        if (!input.trim()) {
            statusDiv.innerHTML = '<span class="text-warning">Please enter at least one identity.</span>';
            return;
        }

        btn.disabled    = true;
        btn.textContent = 'Resolving\u2026';
        statusDiv.innerHTML  = '<span class="mus-spinner"></span> Looking up identities\u2026';
        resultsDiv.innerHTML = '';

        fetch(CONFIG.restUrl, {
            method:  'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-XSRF-TOKEN': getXsrfToken()
            },
            credentials: 'same-origin',
            body: JSON.stringify({ identities: input })
        })
        .then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        })
        .then(function (data) {
            if (data.error) throw new Error(data.error);
            renderResults(data, resultsDiv, statusDiv);
        })
        .catch(function (err) {
            statusDiv.innerHTML =
                '<span class="text-danger">Error: ' + esc(err.message) + '</span>';
        })
        .finally(function () {
            btn.disabled    = false;
            btn.textContent = 'Resolve';
        });
    }


    // ──────────────────────────────────────────
    //  RENDER RESULTS TABLE
    // ──────────────────────────────────────────

    function renderResults(data, container, statusDiv) {
        var html  = '';
        var parts = [];

        if (data.found    && data.found.length)    parts.push('<strong>' + data.found.length    + '</strong> resolved');
        if (data.notFound && data.notFound.length)  parts.push('<strong class="text-danger">' + data.notFound.length + '</strong> not found');
        statusDiv.innerHTML = parts.join(' &middot; ');

        // ── Found table ──
        if (data.found && data.found.length > 0) {
            html += '<table class="table table-condensed table-striped mus-table">';
            html += '<thead><tr>';
            html += '  <th class="mus-th-cb"><input type="checkbox" id="musSelectAll" checked /></th>';
            html += '  <th>Username</th>';
            html += '  <th>Display Name</th>';
            html += '  <th>Email</th>';
            html += '  <th>Department</th>';
            html += '  <th>Manager</th>';
            html += '  <th>Status</th>';
            html += '</tr></thead><tbody>';

            data.found.forEach(function (u) {
                var rowClass = (u.status === 'Inactive') ? ' class="mus-row-inactive"' : '';
                html += '<tr' + rowClass + '>';
                html += '  <td><input type="checkbox" class="mus-cb"'
                     +  '    data-id="'   + esc(u.id)   + '"'
                     +  '    data-name="' + esc(u.name) + '"'
                     +  (u.status === 'Inactive' ? '' : ' checked')
                     +  ' /></td>';
                html += '  <td>' + esc(u.name)        + '</td>';
                html += '  <td>' + esc(u.displayName) + '</td>';
                html += '  <td>' + esc(u.email)       + '</td>';
                html += '  <td>' + esc(u.department)  + '</td>';
                html += '  <td>' + esc(u.manager)     + '</td>';
                html += '  <td>' + statusBadge(u.status) + '</td>';
                html += '</tr>';
            });

            html += '</tbody></table>';
            html += '<div class="mus-actions">';
            html += '  <button id="musAddBtn" class="btn btn-success" type="button">';
            html += '    Add Selected to Request';
            html += '  </button>';
            html += '  <span id="musAddStatus" class="mus-add-status"></span>';
            html += '</div>';
        }

        // ── Not-found list ──
        if (data.notFound && data.notFound.length > 0) {
            html += '<div class="mus-notfound">';
            html += '  <strong class="text-danger">Could not resolve:</strong> ';
            html += '  ' + data.notFound.map(function (t) {
                return '<code>' + esc(t) + '</code>';
            }).join(', ');
            html += '  <div class="mus-notfound-hint">';
            html += '    Check spelling, try the exact username, or search individually above.';
            html += '  </div>';
            html += '</div>';
        }

        container.innerHTML = html;

        // ── Bind select-all ──
        var selectAll = document.getElementById('musSelectAll');
        if (selectAll) {
            selectAll.addEventListener('change', function () {
                document.querySelectorAll('.mus-cb').forEach(function (cb) {
                    cb.checked = selectAll.checked;
                });
            });
        }

        // ── Bind "Add Selected" ──
        var addBtn = document.getElementById('musAddBtn');
        if (addBtn) {
            addBtn.addEventListener('click', function () {
                addSelectedToRequest();
            });
        }
    }

    function statusBadge(status) {
        if (status === 'Inactive') {
            return '<span class="label label-warning mus-badge">Inactive</span>';
        }
        return '<span class="label label-success mus-badge">Active</span>';
    }


    // ──────────────────────────────────────────
    //  ADD SELECTED → OOB Request Access UI
    // ──────────────────────────────────────────

    function addSelectedToRequest() {
        var checked = document.querySelectorAll('.mus-cb:checked');
        var addStatus = document.getElementById('musAddStatus');

        if (!checked.length) {
            addStatus.innerHTML = '<span class="text-warning">No users selected.</span>';
            return;
        }

        var selected = [];
        checked.forEach(function (cb) {
            selected.push({
                id:   cb.getAttribute('data-id'),
                name: cb.getAttribute('data-name')
            });
        });

        addStatus.innerHTML = '<span class="mus-spinner"></span> Adding ' + selected.length + ' identities\u2026';

        // ── Strategy A: Angular scope injection (preferred for IIQ 8.x) ──
        if (tryAngularInjection(selected)) {
            addStatus.innerHTML = '<span class="text-success">\u2713 '
                + selected.length + ' identities added via scope.</span>';
            return;
        }

        // ── Strategy B: simulate typeahead (fallback) ──
        var searchInput = document.querySelector(CONFIG.searchInputSelectors);
        if (!searchInput) {
            addStatus.innerHTML =
                '<span class="text-danger">Could not find the identity search input. '
                + 'Check CSS selectors for your IIQ version.</span>';
            return;
        }

        processTypeaheadQueue(selected, 0, searchInput, addStatus);
    }


    // ── Strategy A ──
    function tryAngularInjection(selected) {
        try {
            // Try common controller selectors for IIQ 8.x
            var controllers = [
                '[ng-controller*="RequestAccess"]',
                '[ng-controller*="requestAccess"]',
                '[ng-controller*="LCMRequestAccess"]',
                '[data-ng-controller*="RequestAccess"]'
            ];

            for (var i = 0; i < controllers.length; i++) {
                var el = document.querySelector(controllers[i]);
                if (!el) continue;

                var scope = angular.element(el).scope();
                if (!scope) continue;

                // Look for the identity-add method — name varies by version
                var methods = [
                    'addIdentityToRequest',
                    'addIdentity',
                    'selectIdentity',
                    'addRequestee'
                ];

                for (var j = 0; j < methods.length; j++) {
                    if (typeof scope[methods[j]] === 'function') {
                        selected.forEach(function (u) {
                            scope[methods[j]]({ id: u.id, name: u.name });
                        });
                        scope.$apply();
                        return true;
                    }
                }

                // Alternative: push directly into the identities array
                var arrays = ['selectedIdentities', 'identities', 'requestees', 'identityIds'];
                for (var k = 0; k < arrays.length; k++) {
                    if (Array.isArray(scope[arrays[k]])) {
                        selected.forEach(function (u) {
                            var exists = scope[arrays[k]].some(function (x) {
                                return x.id === u.id;
                            });
                            if (!exists) {
                                scope[arrays[k]].push({ id: u.id, name: u.name });
                            }
                        });
                        scope.$apply();
                        return true;
                    }
                }
            }
        } catch (e) {
            console.warn('[MultiUserSearch] Angular injection failed:', e);
        }
        return false;
    }


    // ── Strategy B ──
    function processTypeaheadQueue(queue, idx, searchInput, statusEl) {
        if (idx >= queue.length) {
            statusEl.innerHTML = '<span class="text-success">\u2713 '
                + queue.length + ' identities processed via typeahead.</span>';
            return;
        }

        statusEl.innerHTML = '<span class="mus-spinner"></span> Adding '
            + (idx + 1) + ' of ' + queue.length + '\u2026';

        setNativeValue(searchInput, queue[idx].name);
        searchInput.dispatchEvent(new Event('input',  { bubbles: true }));
        searchInput.dispatchEvent(new Event('change', { bubbles: true }));
        searchInput.dispatchEvent(new Event('keyup',  { bubbles: true }));

        // Wait for typeahead dropdown, then click first match
        setTimeout(function () {
            var suggestion = document.querySelector(
                '.typeahead-result, '       +
                '.ui-menu-item, '           +
                '.suggestion-item, '        +
                '[class*="search-result"] li, ' +
                '.dropdown-menu li a'
            );
            if (suggestion) {
                suggestion.click();
            } else {
                console.warn('[MultiUserSearch] No typeahead suggestion found for: ' + queue[idx].name);
            }

            setTimeout(function () {
                processTypeaheadQueue(queue, idx + 1, searchInput, statusEl);
            }, CONFIG.betweenUsers);

        }, CONFIG.typeaheadDelay);
    }


    // ──────────────────────────────────────────
    //  HELPERS
    // ──────────────────────────────────────────

    function setNativeValue(el, value) {
        var setter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, 'value'
        ).set;
        setter.call(el, value);
    }

    function getXsrfToken() {
        // Try cookie first (IIQ 8.x default)
        var patterns = ['CSRF-TOKEN', 'XSRF-TOKEN', '_csrf'];
        for (var i = 0; i < patterns.length; i++) {
            var m = document.cookie.match(new RegExp(patterns[i] + '=([^;]+)'));
            if (m) return decodeURIComponent(m[1]);
        }
        // Fallback: meta tag
        var meta = document.querySelector('meta[name="_csrf"]');
        if (meta) return meta.getAttribute('content');

        // Fallback: hidden input
        var input = document.querySelector('input[name="_csrf"]');
        if (input) return input.value;

        return '';
    }

    function esc(s) {
        if (!s) return '';
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(s));
        return div.innerHTML;
    }

})();
