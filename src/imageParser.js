const _ = require('lodash')
const SHA_REGEX = /_[a-f0-9]{8}/
const SEMVER_REGEX = /_[0-9]+[.][0-9]+[.][0-9]+/
const REFINED_VERSION = /^[v]?(([0-9]+)([.][0-9]+)?([.][0-9]+)?([-]([a-zA-Z.0-9]+))?)$/
const BUILD_NUMBER_REGEX = /_[0-9]+/

function parseImage (image, supplyDefaults) {
  const parts = image.split('/')
  if (parts.length === 1) {
    return supplyDefaults
      ? [ 'official', parts[ 0 ] ]
      : [ undefined, parts[ 0 ] ]
  } else if (parts.length === 2) {
    return parts
  } else {
    return parts.slice(1)
  }
}

// latest
// #
// #.#
// #.#.#
// owner_repo_branch_version_build_sha
// branch_version_build_sha
// version_sha
function parseTag (tag, repoOwner, imageName, supplyDefaults = true) {
  let sourceTag = tag
  if (!tag && supplyDefaults) {
    sourceTag = 'latest'
  }
  const parts = sourceTag ? sourceTag.split('_') : []
  if (parts.length > 6) {
    // someone has used underscores in their owner/repo/branch name :|
    return parseProblemTag(sourceTag, repoOwner, imageName)
  } else if (parts.length === 0) {
    return [ repoOwner, imageName, undefined, undefined, undefined, undefined ] // allows for upstream filters
  } else if (parts.length === 1) {
    if (sourceTag === 'latest') {
      return [ repoOwner, imageName, 'master', 'latest' ]
    } else {
      return [ repoOwner, imageName, 'master', sourceTag ]
    }
  } else if (parts.length === 2) {
    return [ repoOwner, imageName, 'master', parts[ 0 ], undefined, parts[ 1 ] ]
  } else if (parts.length === 3) {
    return [ repoOwner, imageName, 'master', ...parts ]
  } else if (parts.length === 4) {
    return [ repoOwner, imageName, ...parts ]
  } else if (parts.length === 6) {
    return parts
  }
}

function parseProblemTag (tag, repoOwner, imageName) {
  // tell them about it
  console.warn(`The tag '${tag}' contains more underscores than I would like.`)
  console.warn('I will attempt to parse it anyway but may make the wrong assumptions.')
  console.warn('This could lead to missed deployments or invalid deployments.')
  console.warn('Use of underscores in your github naming conventions and hikaru is ill advised.')

  const [ sha, tag1 ] = extractAndReplace(SHA_REGEX, tag)
  const [ version, tag2 ] = extractAndReplace(SEMVER_REGEX, tag1)
  const [ build, tag3 ] = extractAndReplace(BUILD_NUMBER_REGEX, tag2)

  const hasOwner = _.includes(tag3, repoOwner)
  const hasImage = _.includes(tag3, imageName)
  let remainder = tag3.replace(`${repoOwner}_`, '').replace(`${imageName}_`, '')
  const parts = remainder.split('_')
  if (hasOwner && hasImage) {
    return [ repoOwner, imageName, remainder, version, build, sha ]
  } else if (hasOwner) {
    if (parts.length > 2) {
      let branch = parts.slice(1).join('_')
      console.warn('The Docker image and GitHub repo name appear not to match and there are too many remaining tag segments to reliably determine which belong to the repo vs. the branch.')
      console.warn(`Assigning '${parts[0]}' to the repo and '${branch}' to the branch. /shrug`)
      return [ repoOwner, parts[ 0 ], branch, version, build, sha ]
    } else if (parts.length === 2) {
      return [ repoOwner, parts[ 0 ], parts[ 1 ], version, build, sha ]
    } else {
      console.warn(`Looks like there are not enough segments to determine the repo and branch - assigning '${imageName}' to repo and '${remainder}' to branch. /shrug`)
      return [repoOwner, imageName, remainder, version, build, sha]
    }
  } else if (hasImage) {
    if (parts.length > 2) {
      let branch = parts.slice(1).join('_')
      console.warn('The Docker repo and GitHub owner name appear not to match and there are too many remaining tag segments to reliably determine which belong to the repo vs. the branch.')
      console.warn(`Assigning '${parts[0]}' to the owner and '${branch}' to the branch. /shrug`)
      return [ parts[ 0 ], imageName, branch, version, build, sha ]
    } else if (parts.length === 2) {
      return [ parts[ 0 ], imageName, parts[ 1 ], version, build, sha ]
    } else {
      console.warn(`Looks like there are not enough segments to determine the owner and branch - assigning '${repoOwner}' to owner and '${remainder}' to branch. /shrug`)
      return [ repoOwner, imageName, remainder, version, build, sha ]
    }
  } else {
    console.warn('Looks like this might be a branch name with underscores only.')
    console.warn(`Assigning '${remainder}' to branch, '${repoOwner}' to owner and '${imageName}' to the repo. /shrug`)
    return [ repoOwner, imageName, remainder, version, build, sha ]
  }
}

function extractAndReplace (regex, tag) {
  const segment = (regex.test(tag))
    ? regex.exec(tag)[ 0 ] : ''
  tag = tag.replace(segment, '')
  return [ segment.replace('_', ''), tag ]
}

function parse (fullImage, supplyDefaults = true) {
  const [ image, tag ] = fullImage.split(':')
  const [ repoOwner, imageName ] = parseImage(image, supplyDefaults)
  const [ a, b, c, d, e, f ] = parseTag(tag, repoOwner, imageName, supplyDefaults)
  const versions = refineVersion(d)
  return {
    imageName: imageName,
    imageOwner: repoOwner,
    owner: a,
    repo: b,
    branch: c,
    fullVersion: versions.full,
    version: versions.refined,
    prerelease: versions.pre,
    build: e,
    commit: f
  }
}

function refineVersion (version) {
  if (!version) {
    return {
      full: undefined,
      refined: undefined,
      pre: undefined
    }
  }
  const match = REFINED_VERSION.exec(version)
  if (match) {
    return {
      full: version,
      refined: match[1],
      pre: match.length >= 7 ? match[6] : null
    }
  } else {
    return {
      full: version,
      refined: version,
      pre: null
    }
  }
}

module.exports = {
  parse: parse,
  parseImage: parseImage,
  parseTag: parseTag,
  refineVersion: refineVersion
}
