# hikaru

A deployment automation service for kubernetes. 100 internets if you get the reference. 1000 internets if you get why.

# Automated Continuous Delivery

Rolling pgrades to existing deployments based on kubernetes Deployment labels and metadata hikaru derives from the Docker image's tag.

## Specifically

hikaru is asked by API call (think WebHook) to evaluate a Docker image. It determines which Deployments would qualify for an upgrade based on the image's tag and each Deployment's labels. For each Deployment that qualifies, hikaru will perform rolling upgrades using the image.

In practice, this is simple to use and requires very little effort. In order to use it, however, you and your team will have to adopt some conventions so that hikaru will be able to determine when to perform upgrades.

## How hikaru Reads The Tag

Works best with [buildgoggles](https://www.npmjs.com/package/buildgoggles) style tags.

> Note: build is calculated based on commits and some other things in the git repo so that it will be consistent across machines given the same commit history.

hikaru understands how to process the following tag styles:

 * if the build is from the master branch
 	* `latest` - the latest build from our master branch
 	* `major` - the major part of the semantic version
 	* `major.minor` - the major and minor parts of the semantic version
 * `{branch}_{version}_{build}_{commit-slug}` - for builds generated from 
 * A tag generated by builgGoggles could include: `{owner}_{branch}_{version}_{build}_{commit-slug}` to allow for builds of forks and builds where multiple images are generated from a single repo.

hikaru can either determine or infer 6 pieces of information about a Docker image:

 * Docker image (two parts)
     * repo: if it's empty, it's an official repo, it's set to the image name
     * name: the actual image name
     * examples: 
         * `redis` - image = `redis/redis`
         * `mhart/alpine-node` - image = `mhart/alpine-node`
 * Owner
 	* hikaru only parses this out of the first position of a tag with 5+ elements
 	* if not specified, this is inferred from the image's owner name
 	* examples:
 		* `npm/app:arobson_master_1.0.1_10_abcd1234` - owner = `arobson`
 		* `npm/app:latest` - owner = `npm`
 * Branch
 	* parsed from the front of tags with 4 elements or
 	* conditionally from larger tags depending on element count
 	* if not specified, hikaru infers `master`
 	* examples:
 		* `npm/app:arobson_test_1.0.1_10_abcd1234` - branch = `test`
 		* `npm/app:now-with-more-stuff_1.0.1_10_abcd1234` - branch = `now-with-more-stuff`
 		* `npm/app:1.0` - branch = `master`
 		* `npm/app:1` - branch = `master`
 		* `npm/app:latest` - branch = `master`
 * Version
 	* hikaru has a nuanced reading of versioning
 	* its goal is to determine if an image would be considered a "newer" version of an existing version
 	* easiest to understand by example:
 		* `npm/app:latest` - `latest`
 		* `npm/app:1` - `latest 1.x.x`
 		* `npm/app:1.1` - `latest 1.1.x`
 		* `npm/app:arobson_test_1.0.1_10_abcd1234` - `1.0.1`
 * Build Number
 	* unlike other values, hikaru does not infer a build when its not in the tag
 	* it shows when one image is newer than another
 	* always comes immediately after the version in a tag
 * Commit SHA/Slug
 	* like the build number, never inferred
 	* only valuable as a `lock` when testing development builds
 	* always 8 characters at the end of the tag

## How hikaru Filters By Label

Deployment labels act like filters that hikaru will use against the image metadata it determines from the tag.

 * `image` - required for hikaru to know what docker image to match
 * `owner` - limit deployments from a specific owner, omission means _any_ fork
 * `branch` - limit deployments to a specific branch, omission means _any_ branch
 * `version` - provide version restrictions
 * `commit` - **!caution!** locks the deployment to a specific commit

## Run Jobs

In a limited capacity, hikaru has the ability to kick off kubernetes jobs. This is intended to help automate post-deploy tasks. The job definitions should effectively be templates that make use of values set by configuration maps managed elsewhere.

## API

### `POST /api/image/{dockerImage}`

Responds with a list of deployments which will receive rolling update calls with the new Docker image.

### `GET /api/image/{repository}/{image}
### `GET /api/image/{registry}/{repository}/{image}

Responds with a list of namespaces and services presently using the image. 

Useful to see which services may be eligible for upgrade on the image (depends entirely on the tag).

### `POST /api/job`

Based on the content type, you can supply `application/json` or `application/yaml` as the job definition

## Environment Variables
All configuration is driven by environment variables:

 * `K8S-URL`
 * `K8S-HOST`
 * `K8S-TOKEN`
 * `K8S-CA`
 * `K8S-CERT`
 * `K8S-KEY`
 * `K8S-USERNAME`
 * `K8S-PASSWORD`

Presently it only uses basic auth (username & password).

## TO DO

### Version & Build Number Support

Automated upgrades shouldn't happen when the semantic version & build number are _less than_ the existing deployed image's version and build number. This isn't currently something hikaru does. It is further complicated because we (and others likely) take advantage of `latest` style image tags for initial deployments/redeploys. There would need to be some way for hikaru to find a version/build for services or assume that any build wins over latest, etc.

### Automated Upgrade Opt-Out

Hikaru will ignore deployments that don't have owner, repo and branch labels but it could be nice to differentiate between an automated CI/CD deployment and a "human said to force this" deployment. Flagging deployments to opt-out of the automated deploy would be one part of this.

### More auth support?

Based on which variables are available, `hikaru` should determine which authenitcation approach to take. The options are, token, cert & key or username & password. The ca can be provided with the latter two options.
