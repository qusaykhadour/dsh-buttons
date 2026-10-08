/**
 * dsh-buttons — browser half.
 *
 * Adds two ways to remove Sessions for good, on top of the host route
 * `POST /api/session.delete`:
 *
 *  1. **One Session** — "Delete session" in the row's "…" menu, with a
 *     confirmation dialog naming it.
 *  2. **A group** — a pick button on the row (and the same action in the menu)
 *     marks Sessions, a floating bar counts them, and one confirmation deletes
 *     the whole set one by one with progress and a per-code summary.
 *
 * Confirming archives each Session through the app's own workspace controller
 * first (best effort), so a row leaves the sidebar before its log disappears.
 *
 * Selection is plugin state, not app state: the sidebar is untouched, no row is
 * re-rendered differently, and nothing is written to disk until the delete runs.
 */

window.__ModuleLoader__.load({
  id: 'dsh-buttons',
  factory: function (require) {
    var module = { exports: {} }
    var exports = module.exports

    var MENU_SLOT = 'sidebar.workspaces.session.menu.item'
    var ROW_ACTION_SLOT = 'sidebar.workspaces.session.row.action'
    var OVERLAY_SLOT = 'shell.overlay'
    var ROUTE = 'api/session.delete'
    var PICK_MENU_ORDER = 450
    var DELETE_MENU_ORDER = 500
    var ROW_ACTION_ORDER = 300

    /* ---------------------------------------------------------------- copy */

    /**
     * Whether the interface is reading in Arabic right now.
     * @param ctx - client root context.
     * @returns true for any `ar*` active locale.
     */
    function isArabic(ctx) {
      try {
        return String(ctx.locale.getSnapshot().active || 'en').toLowerCase().indexOf('ar') === 0
      } catch (err) {
        return false
      }
    }

    /**
     * The plugin's own copy in the language the interface is using.
     * @param ctx - client root context.
     * @returns the string table.
     */
    function copy(ctx) {
      if (isArabic(ctx)) {
        return {
          menu: 'حذف المحادثة نهائياً',
          pick: 'تحديد للحذف الجماعي',
          unpick: 'إزالة من التحديد',
          selected: function (count) {
            return count === 1 ? 'محادثة واحدة محددة' : count + ' محادثات محددة'
          },
          bulkDelete: 'حذف المحدد',
          bulkDeleteCount: function (count) {
            return 'حذف المحدد (' + count + ')'
          },
          failedList: 'اللي فشل:',
          clear: 'إلغاء التحديد',
          title: 'حذف المحادثة نهائياً؟',
          bulkTitle: function (count) {
            return 'حذف ' + count + ' محادثة نهائياً؟'
          },
          description: function (name) {
            return '«' + name + '» رح تنحذف من القرص نهائياً: سجل المحادثة وكاش العرض. ما في رجعة ولا سلة. '
          },
          bulkDescription:
            'رح تنحذف هالمحادثات من القرص نهائياً: السجل وكاش العرض وتحديدها بالقائمة. ما في رجعة ولا سلة. ',
          more: function (count) {
            return 'و ' + count + ' غيرها…'
          },
          confirm: 'حذف نهائي',
          confirmCount: function (count) {
            return 'حذف نهائي (' + count + ')'
          },
          cancel: 'إلغاء',
          close: 'إغلاق',
          working: 'جارٍ الحذف…',
          progress: function (done, total) {
            return 'حذفت ' + done + ' من ' + total + '…'
          },
          doneTitle: 'تم الحذف',
          doneOne: 'انحذفت ملفات المحادثة. إذا ضلّت البطاقة ظاهرة بالقائمة، اعمل تحديث للصفحة (F5).',
          doneMany: function (ok, failed) {
            return failed === 0
              ? 'انحذفت ' + ok + ' محادثة. إذا ضلّت بطاقات ظاهرة بالقائمة، اعمل تحديث للصفحة (F5).'
              : 'انحذفت ' + ok + ' وفشلت ' + failed + '. الفاشلة غالباً شغّالة أو مفتوحة — وقّفها وجرّبها لحالها.'
          },
          failedTitle: 'فشل الحذف',
          failedNone: 'ما انحذفت ولا محادثة.',
          reasons: {
            'session-active': 'شغّالة الآن',
            'file-locked': 'مقفولة (مفتوحة)',
            'not-found': 'ملفاتها مش موجودة',
            partial: 'حذف جزئي',
            'invalid-session-id': 'معرّف غير صالح',
            network: 'تعذّر الوصول للخادم',
            generic: 'خطأ',
          },
          errors: {
            'session-active': 'المحادثة شغّالة الآن (دور جارٍ أو مهمة خلفية). وقّفها أولاً ثم أعد المحاولة.',
            'file-locked': 'الملف مقفول لأن المحادثة مفتوحة بهذه اللحظة. سكّر تبويبها أو أعد تشغيل DSH ثم أعد المحاولة.',
            'not-found': 'ما لقيت ملفات هالمحادثة على القرص — يمكن محذوفة أصلاً.',
            'invalid-session-id': 'معرّف المحادثة غير صالح.',
            partial: 'انحذف جزء من الملفات والباقي فشل. راجع السجل.',
            network: 'تعذّر الوصول لخادم DSH. تأكد إن التطبيق شغّال وأعد المحاولة.',
            generic: 'فشل الحذف. ما تغيّر شي.',
          },
        }
      }
      return {
        menu: 'Delete session',
        pick: 'Select for bulk delete',
        unpick: 'Remove from selection',
        selected: function (count) {
          return count === 1 ? '1 session selected' : count + ' sessions selected'
        },
        bulkDelete: 'Delete selected',
        bulkDeleteCount: function (count) {
          return 'Delete selected (' + count + ')'
        },
        failedList: 'Failed:',
        clear: 'Clear selection',
        title: 'Delete this session permanently?',
        bulkTitle: function (count) {
          return 'Delete ' + count + ' sessions permanently?'
        },
        description: function (name) {
          return '“' + name + '” will be removed from disk for good: the stored log and the projection cache. There is no trash and no undo. '
        },
        bulkDescription:
          'These sessions will be removed from disk for good: their logs, their projection caches and their registration. There is no trash and no undo. ',
        more: function (count) {
          return 'and ' + count + ' more…'
        },
        confirm: 'Delete permanently',
        confirmCount: function (count) {
          return 'Delete permanently (' + count + ')'
        },
        cancel: 'Cancel',
        close: 'Close',
        working: 'Deleting…',
        progress: function (done, total) {
          return 'Deleted ' + done + ' of ' + total + '…'
        },
        doneTitle: 'Deleted',
        doneOne: 'The session files are gone. If the row is still listed, refresh the page (F5).',
        doneMany: function (ok, failed) {
          return failed === 0
            ? ok + ' sessions deleted. If rows are still listed, refresh the page (F5).'
            : ok + ' deleted and ' + failed + ' failed. The failed ones are usually running or open — stop them and retry one by one.'
        },
        failedTitle: 'Deletion failed',
        failedNone: 'Nothing was deleted.',
        reasons: {
          'session-active': 'running now',
          'file-locked': 'locked (open)',
          'not-found': 'files already gone',
          partial: 'partial removal',
          'invalid-session-id': 'invalid id',
          network: 'host unreachable',
          generic: 'error',
        },
        errors: {
          'session-active': 'This session is running (a turn or background work). Stop it first and try again.',
          'file-locked': 'The log file is locked because the session is open right now. Close its tab or restart DSH, then retry.',
          'not-found': 'No session files found on disk — it may already be deleted.',
          'invalid-session-id': 'Invalid session id.',
          partial: 'Part of the files were deleted and the rest failed. Check the log.',
          network: 'Could not reach the DSH host. Make sure the app is running, then retry.',
          generic: 'Deletion failed. Nothing was removed.',
        },
      }
    }

    /* --------------------------------------------------------------- state */

    /** One store for the plugin: the pending dialog and the picked Sessions. */
    var state = { pending: null, selected: [] }
    var listeners = new Set()

    /** Publish the current state to every subscriber. */
    function emit() {
      listeners.forEach(function (listener) {
        try {
          listener(state)
        } catch (err) {}
      })
    }

    /**
     * Merge a patch into the store.
     * @param patch - partial state.
     */
    function update(patch) {
      state = Object.assign({}, state, patch)
      emit()
    }

    /**
     * Subscribe to store changes.
     * @param listener - called on every change.
     * @returns the unsubscribe function.
     */
    function subscribe(listener) {
      listeners.add(listener)
      return function () {
        listeners.delete(listener)
      }
    }

    /**
     * Add or remove one Session in the selection.
     * @param sessionId - targeted Session id.
     */
    function toggleSelected(sessionId) {
      var index = state.selected.indexOf(sessionId)
      var next =
        index === -1
          ? state.selected.concat([sessionId])
          : state.selected.filter(function (id) {
              return id !== sessionId
            })
      update({ selected: next })
    }

    /* ---------------------------------------------------------- data reads */

    /**
     * The title the sidebar shows for one Session.
     * @param ctx - client root context.
     * @param sessionId - Session id.
     * @returns the display title, or the id when unknown.
     */
    function titleOf(ctx, sessionId) {
      try {
        var record = ctx.get('sessions')?.list?.getSnapshot?.().byId?.[sessionId]
        if (
          record !== undefined &&
          record !== null &&
          typeof record.displayTitle === 'string' &&
          record.displayTitle !== ''
        ) {
          return record.displayTitle
        }
      } catch (err) {}
      return sessionId
    }

    /**
     * Resolve titles for a set of ids.
     * @param ctx - client root context.
     * @param ids - Session ids.
     * @returns the titles, in order.
     */
    function titlesOf(ctx, ids) {
      return ids.map(function (id) {
        return titleOf(ctx, id)
      })
    }

    /* ---------------------------------------------------------- behaviour */

    /**
     * Hide a row before its files disappear, so the sidebar never renders a
     * Session whose log is already gone. Refusals are not fatal.
     * @param ctx - client root context.
     * @param sessionId - targeted Session id.
     * @returns a promise that always resolves.
     */
    function archiveFirst(ctx, sessionId) {
      try {
        var workspaces = ctx.get('workspaces')
        if (workspaces !== undefined && workspaces !== null && typeof workspaces.archiveSession === 'function') {
          return Promise.resolve(workspaces.archiveSession(sessionId)).catch(function () {})
        }
      } catch (err) {}
      return Promise.resolve()
    }

    /**
     * Ask the host to delete one Session.
     * @param sessionId - targeted Session id.
     * @returns a promise of `{ id, ok, code }`.
     */
    function deleteOne(sessionId) {
      return fetch(ROUTE, {
        method: 'POST',
        // Same-origin carries the signed browser-session cookie the Host
        // requires; without it the route answers 401 before dispatch.
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionId }),
      }).then(
        function (response) {
          return response
            .json()
            .catch(function () {
              return null
            })
            .then(function (payload) {
              var ok = response.ok && payload !== null && payload !== undefined && payload.ok === true
              var code =
                payload !== null && payload !== undefined && typeof payload.error === 'string'
                  ? payload.error
                  : 'generic'
              return { id: sessionId, ok: ok, code: code }
            })
        },
        function () {
          return { id: sessionId, ok: false, code: 'network' }
        },
      )
    }

    /**
     * Open the confirmation for a set of Sessions.
     * @param ctx - client root context.
     * @param ids - Session ids to delete.
     */
    function openConfirm(ctx, ids) {
      if (!Array.isArray(ids) || ids.length === 0) return
      update({
        pending: { ids: ids, titles: titlesOf(ctx, ids), status: 'confirm', message: '', progress: '', details: [] },
      })
    }

    /**
     * Delete every Session in the pending set one by one, reporting progress and
     * a summary by failure reason.
     * @param ctx - client root context.
     * @param text - copy table for the active language.
     */
    function runDelete(ctx, text) {
      var pending = state.pending
      if (pending === null) return
      var ids = pending.ids
      var titles = pending.titles
      var results = []
      var titleById = {}
      ids.forEach(function (id, index) {
        titleById[id] = titles[index]
      })
      update({
        pending: {
          ids: ids,
          titles: titles,
          status: 'working',
          message: text.working,
          progress: text.progress(0, ids.length),
          details: [],
        },
      })

      var chain = Promise.resolve()
      ids.forEach(function (sessionId, index) {
        chain = chain.then(function () {
          update({
            pending: {
              ids: ids,
              titles: titles,
              status: 'working',
              message: text.working,
              progress: text.progress(index, ids.length),
              details: [],
            },
          })
          return archiveFirst(ctx, sessionId)
            .then(function () {
              return deleteOne(sessionId)
            })
            .then(function (result) {
              results.push(result)
            })
        })
      })

      chain.then(function () {
        var okIds = results
          .filter(function (result) {
            return result.ok
          })
          .map(function (result) {
            return result.id
          })
        var failed = results.filter(function (result) {
          return !result.ok
        })
        var remaining = state.selected.filter(function (id) {
          return okIds.indexOf(id) === -1
        })
        var reasonText = failed
          .map(function (result) {
            return text.reasons[result.code] !== undefined ? text.reasons[result.code] : text.reasons.generic
          })
          .filter(function (label, index, all) {
            return all.indexOf(label) === index
          })
          .join(' · ')
        var status
        var message
        if (failed.length === 0) {
          status = 'done'
          message = ids.length === 1 ? text.doneOne : text.doneMany(okIds.length, 0)
        } else if (okIds.length === 0) {
          status = 'error'
          message = (ids.length === 1 ? text.errors[failed[0].code] || text.errors.generic : text.failedNone) + ' — ' + reasonText
        } else {
          status = 'error'
          message = text.doneMany(okIds.length, failed.length) + ' (' + reasonText + ')'
        }
        update({
          selected: remaining,
          pending: {
            ids: ids.filter(function (id) {
              return remaining.indexOf(id) !== -1
            }),
            titles: titles,
            status: status,
            message: message,
            progress: '',
            details: failed.slice(0, 20).map(function (result) {
              var reason = text.reasons[result.code] !== undefined ? text.reasons[result.code] : text.reasons.generic
              return (titleById[result.id] !== undefined ? titleById[result.id] : result.id) + ' — ' + reason
            }),
          },
        })
      })
    }

    /* ---------------------------------------------------------- components */

    /**
     * Build the plugin's components against the loaded React and primitives.
     * @param React - the app's React.
     * @param primitives - `@deepseek-ai/dsh-client-ui-primitives`.
     * @param ctx - client root context.
     * @returns the components to register.
     */
    function build(React, primitives, ctx) {
      /**
       * Read the plugin store and re-render on every change.
       * @returns the current state.
       */
      function useStore() {
        var pair = React.useState(state)
        React.useEffect(function () {
          return subscribe(function (next) {
            pair[1](next)
          })
        }, [])
        return pair[0]
      }

      /**
       * The row's pick button: marks or unmarks one Session.
       * @param props - slot props: the row's Session id.
       * @returns the button.
       */
      function PickRowButton(props) {
        var snapshot = useStore()
        var text = copy(ctx)
        var picked = snapshot.selected.indexOf(props.sessionId) !== -1
        var label = picked ? text.unpick : text.pick
        var Icon = picked ? primitives.IconCheckCircleFillRegular : primitives.IconChecklistOutlineRegular
        return React.createElement(primitives.Tooltip, {
          label: label,
          side: 'bottom',
          align: 'end',
          delayMs: 500,
          children: React.createElement(
            'button',
            {
              type: 'button',
              'aria-label': label,
              'aria-pressed': picked,
              onClick: function () {
                toggleSelected(props.sessionId)
              },
              style: {
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '22px',
                height: '22px',
                padding: '0',
                border: 'none',
                borderRadius: '4px',
                background: 'transparent',
                color: picked ? '#e5534b' : 'inherit',
                opacity: picked ? '1' : '0.7',
                cursor: 'pointer',
              },
            },
            React.createElement(Icon, { size: 14 }),
          ),
        })
      }

      /**
       * The "…" menu entry that adds or removes this row in the group.
       * @param props - slot props: the row's Session id plus the menu-state hook.
       * @returns the menu button.
       */
      function PickMenuItem(props) {
        var snapshot = useStore()
        var text = copy(ctx)
        var menuState = typeof props.useMenuOpenState === 'function' ? props.useMenuOpenState() : null
        var closeMenu = menuState !== null && typeof menuState[1] === 'function' ? menuState[1] : null
        var picked = snapshot.selected.indexOf(props.sessionId) !== -1
        var Icon = picked ? primitives.IconCheckCircleFillRegular : primitives.IconChecklistOutlineRegular
        return React.createElement(primitives.MenuItemButton, {
          icon: React.createElement(Icon, { size: 14 }),
          onSelect: function () {
            if (closeMenu !== null) closeMenu(false)
            toggleSelected(props.sessionId)
          },
          children: picked ? text.unpick : text.pick,
        })
      }

      /**
       * The "…" menu entry that deletes this one Session.
       * @param props - slot props: the row's Session id plus the menu-state hook.
       * @returns the menu button.
       */
      function DeleteMenuItem(props) {
        var snapshot = useStore()
        var text = copy(ctx)
        var menuState = typeof props.useMenuOpenState === 'function' ? props.useMenuOpenState() : null
        var closeMenu = menuState !== null && typeof menuState[1] === 'function' ? menuState[1] : null
        // A selection is never ignored. While anything is picked this entry
        // deletes the whole picked set (and the dialog lists exactly which), so
        // opening a row menu can never quietly delete one Session out of a group.
        var pickedCount = snapshot.selected.length
        var target = pickedCount > 0 ? snapshot.selected.slice() : [props.sessionId]
        return React.createElement(primitives.MenuItemButton, {
          icon: React.createElement(primitives.IconTrashOutlineRegular, { size: 14 }),
          onSelect: function () {
            if (closeMenu !== null) closeMenu(false)
            openConfirm(ctx, target)
          },
          children: pickedCount > 0 ? text.bulkDeleteCount(pickedCount) : text.menu,
        })
      }

      /**
       * The floating bar that counts the picked Sessions.
       * @returns the bar, or null while nothing is picked.
       */
      function SelectionBar() {
        var snapshot = useStore()
        var text = copy(ctx)
        if (snapshot.selected.length === 0) return null
        return React.createElement(
          'div',
          {
            style: {
              position: 'fixed',
              left: '50%',
              bottom: '24px',
              transform: 'translateX(-50%)',
              zIndex: '60',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '8px 12px',
              borderRadius: '10px',
              border: '1px solid rgba(255,255,255,0.16)',
              background: 'rgba(28,28,30,0.96)',
              color: '#e9e9ea',
              boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
              fontSize: '13px',
            },
          },
          [
            React.createElement('span', { key: 'count', style: { whiteSpace: 'nowrap' } }, text.selected(snapshot.selected.length)),
            React.createElement(primitives.Button, {
              key: 'delete',
              variant: 'primary',
              onClick: function () {
                openConfirm(ctx, snapshot.selected.slice())
              },
              children: text.bulkDeleteCount(snapshot.selected.length),
            }),
            React.createElement(primitives.Button, {
              key: 'clear',
              variant: 'outline',
              onClick: function () {
                update({ selected: [] })
              },
              children: text.clear,
            }),
          ],
        )
      }

      /**
       * The `shell.overlay` dialog: one confirmation (and one progress readout)
       * for the pending set, whether that set holds one Session or twenty.
       * @returns the open dialog, or null.
       */
      function ConfirmDialog() {
        var snapshot = useStore()
        var text = copy(ctx)
        var request = snapshot.pending
        if (request === null || request === undefined) return null
        var busy = request.status === 'working'
        var settled = request.status === 'done' || request.status === 'error'
        var many = request.ids.length > 1
        var listed = request.titles.slice(0, 12)
        var hidden = request.titles.length - listed.length

        function close() {
          if (!busy) update({ pending: null })
        }

        var footer = React.createElement(
          React.Fragment,
          null,
          settled
            ? React.createElement(primitives.Button, { variant: 'outline', onClick: close, children: text.close })
            : [
                React.createElement(primitives.Button, {
                  key: 'cancel',
                  variant: 'outline',
                  disabled: busy,
                  onClick: close,
                  children: text.cancel,
                }),
                React.createElement(primitives.Button, {
                  key: 'confirm',
                  variant: 'outline',
                  disabled: busy,
                  onClick: function () {
                    runDelete(ctx, text)
                  },
                  children: many ? text.confirmCount(request.ids.length) : text.confirm,
                }),
              ],
        )

        var title
        if (request.status === 'done') title = text.doneTitle
        else if (request.status === 'error') title = text.failedTitle
        else title = many ? text.bulkTitle(request.ids.length) : text.title

        var description
        if (request.status === 'confirm') {
          description = many ? text.bulkDescription : text.description(request.titles[0])
        }

        return React.createElement(primitives.Modal, {
          open: true,
          onClose: busy ? undefined : close,
          closeLabel: text.close,
          title: title,
          description: description,
          footer: footer,
          children: React.createElement(React.Fragment, null, [
            request.status === 'confirm' && many
              ? React.createElement(
                  'ul',
                  {
                    key: 'list',
                    style: { margin: '0', paddingInlineStart: '18px', maxHeight: '220px', overflow: 'auto' },
                  },
                  listed
                    .map(function (item, index) {
                      return React.createElement('li', { key: String(index) }, item)
                    })
                    .concat(hidden > 0 ? [React.createElement('li', { key: 'more' }, text.more(hidden))] : []),
                )
              : null,
            busy && request.progress !== ''
              ? React.createElement('div', { key: 'progress', role: 'status' }, request.progress)
              : null,
            request.message !== '' && request.status !== 'confirm'
              ? React.createElement(
                  'div',
                  { key: 'message', role: request.status === 'error' ? 'alert' : 'status' },
                  request.message,
                )
              : null,
            request.status === 'error' && request.details !== undefined && request.details.length > 0
              ? React.createElement('div', { key: 'failed-list' }, [
                  React.createElement('div', { key: 'heading' }, text.failedList),
                  React.createElement(
                    'ul',
                    { key: 'items', style: { margin: '0', paddingInlineStart: '18px', maxHeight: '180px', overflow: 'auto' } },
                    request.details.map(function (line, index) {
                      return React.createElement('li', { key: String(index) }, line)
                    }),
                  ),
                ])
              : null,
          ]),
        })
      }

      return {
        PickRowButton: PickRowButton,
        PickMenuItem: PickMenuItem,
        DeleteMenuItem: DeleteMenuItem,
        SelectionBar: SelectionBar,
        ConfirmDialog: ConfirmDialog,
      }
    }

    /* ------------------------------------------------------------- plugin */

    exports.inject = ['slots', 'locale', 'sessions', 'workspaces']

    /**
     * Register the row pick button, the menu entries and the two overlays.
     * @param ctx - client root context.
     */
    exports.apply = function apply(ctx) {
      var React = require('react')
      var primitives = require('@deepseek-ai/dsh-client-ui-primitives')
      if (React === undefined || primitives === undefined || primitives.Modal === undefined) return

      var parts = build(React, primitives, ctx)
      var injected = function () {
        return {}
      }

      ctx.slots.inject(ROW_ACTION_SLOT, function* () {
        yield ctx.slots.register(
          { name: ROW_ACTION_SLOT, id: 'session-delete-pick-row', order: ROW_ACTION_ORDER, inject: injected },
          parts.PickRowButton,
        )
      })

      ctx.slots.inject(MENU_SLOT, function* () {
        yield ctx.slots.register(
          { name: MENU_SLOT, id: 'session-delete-pick', order: PICK_MENU_ORDER, inject: injected },
          parts.PickMenuItem,
        )
        yield ctx.slots.register(
          { name: MENU_SLOT, id: 'session-delete', order: DELETE_MENU_ORDER, inject: injected },
          parts.DeleteMenuItem,
        )
      })

      ctx.slots.inject(OVERLAY_SLOT, function* () {
        yield ctx.slots.register(
          { name: OVERLAY_SLOT, id: 'session-delete-bar', inject: injected },
          parts.SelectionBar,
        )
        yield ctx.slots.register(
          { name: OVERLAY_SLOT, id: 'session-delete-confirm', inject: injected },
          parts.ConfirmDialog,
        )
      })
    }

    return module.exports
  },
})
