/* tslint:disable:max-line-length */

import { CORS_HEADERS, getDataURLContent } from './util'

import { Options } from './options'

// KNOWN ISSUE
// -----------
// Can not handle redirect-url, such as when access 'http://something.com/avatar.png'
// will redirect to 'http://something.com/65fc2ffcc8aea7ba65a1d1feda173540'

const TIMEOUT = 30000
const cache: {
  [url: string]: Promise<{ blob: string; contentType: string } | null>
} = {}

export function getBlobFromURL(
  url: string,
  options: Options,
  useCors: boolean = false,
): Promise<{ blob: string; contentType: string } | null> {
  if (cache[url]) {
    return cache[url]
  }

  // cache bypass so we dont have CORS issues with cached images
  // ref: https://developer.mozilla.org/en/docs/Web/API/XMLHttpRequest/Using_XMLHttpRequest#Bypassing_the_cache
  if (options.cacheBust) {
    // tslint:disable-next-line
    url += (/\?/.test(url) ? '&' : '?') + new Date().getTime()
  }

  const failed = (reason: any) => {
    let placeholder = ''
    if (options.imagePlaceholder) {
      const parts = options.imagePlaceholder.split(/,/)
      if (parts && parts[1]) {
        placeholder = parts[1]
      }
    }

    let msg = `Failed to fetch resource: ${url}`
    if (reason) {
      msg = typeof reason === 'string' ? reason : reason.message
    }

    if (msg) {
      console.error(msg)
    }

    return placeholder
  }

  const deferred = window.fetch
    ? window
        .fetch(url, useCors ? CORS_HEADERS : undefined)
        .then((res) =>
          res.blob().then((blob) => ({
            blob,
            contentType: res.headers.get('Content-Type') || '',
          })),
        )
        .then(
          ({ blob, contentType }) =>
            new Promise<{ blob: string; contentType: string }>(
              (resolve, reject) => {
                const reader = new FileReader()
                reader.onloadend = () =>
                  resolve({
                    contentType,
                    blob: reader.result as string,
                  })
                reader.onerror = reject
                reader.readAsDataURL(blob)
              },
            ),
        )
        .then(({ blob, contentType }) => ({
          contentType,
          blob: getDataURLContent(blob),
        }))
    : new Promise<{ blob: string; contentType: string } | null>(
        (resolve, reject) => {
          const req = new XMLHttpRequest()

          const timeout = () => {
            reject(
              new Error(
                `Timeout of ${TIMEOUT}ms occured while fetching resource: ${url}`,
              ),
            )
          }

          const done = () => {
            if (req.readyState !== 4) {
              return
            }

            if (req.status !== 200) {
              reject(
                new Error(
                  `Failed to fetch resource: ${url}, status: ${req.status}`,
                ),
              )
              return
            }

            const encoder = new FileReader()
            encoder.onloadend = () => {
              resolve({
                blob: getDataURLContent(encoder.result as string),
                contentType: req.getResponseHeader('Content-Type') || '',
              })
            }
            encoder.readAsDataURL(req.response)
          }

          req.onreadystatechange = done
          req.ontimeout = timeout
          req.responseType = 'blob'
          req.timeout = TIMEOUT
          req.open('GET', url, true)
          req.send()
        },
      )

  const promise = deferred.catch(failed) as Promise<{
    blob: string
    contentType: string
  } | null>

  // cache result
  cache[url] = promise

  return promise
}
