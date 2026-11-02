// Public checkout belongs in the browser. Only an explicit handoff opens Pocket.
export function pocketAppLinkPaths(hostname: string) {
  return hostname.toLowerCase() === 'pocket.hashpaylink.com' ? '/*' : '/open/checkout/*'
}
export function pocketAndroidLinkExtensions(hostname: string) {
  return {
    'delegate_permission/common.handle_all_urls': {
      dynamic_app_link_components: [
        {'/': pocketAppLinkPaths(hostname)},
        {'/': '*', exclude: true},
      ],
    },
  }
}
