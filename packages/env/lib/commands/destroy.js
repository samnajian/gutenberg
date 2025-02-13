'use strict';
/**
 * External dependencies
 */
const dockerCompose = require( 'docker-compose' );
const util = require( 'util' );
const fs = require( 'fs' ).promises;
const path = require( 'path' );
const inquirer = require( 'inquirer' );

/**
 * Promisified dependencies
 */
const rimraf = util.promisify( require( 'rimraf' ) );
const exec = util.promisify( require( 'child_process' ).exec );

/**
 * Internal dependencies
 */
const { loadConfig } = require( '../config' );

/**
 * Destroy the development server.
 *
 * @param {Object}  options
 * @param {Object}  options.spinner A CLI spinner which indicates progress.
 * @param {boolean} options.debug   True if debug mode is enabled.
 */
module.exports = async function destroy( { spinner, debug } ) {
	const { dockerComposeConfigPath, workDirectoryPath } = await loadConfig(
		path.resolve( '.' )
	);

	try {
		await fs.readdir( workDirectoryPath );
	} catch {
		spinner.text = 'Could not find any files to remove.';
		return;
	}

	spinner.info(
		'WARNING! This will remove Docker containers, volumes, networks, and images associated with the WordPress instance.'
	);

	const { yesDelete } = await inquirer.prompt( [
		{
			type: 'confirm',
			name: 'yesDelete',
			message: 'Are you sure you want to continue?',
			default: false,
		},
	] );

	spinner.start();

	if ( ! yesDelete ) {
		spinner.text = 'Cancelled.';
		return;
	}

	spinner.text = 'Removing WordPress docker containers.';

	await dockerCompose.rm( {
		config: dockerComposeConfigPath,
		commandOptions: [ '--stop', '-v' ],
		log: debug,
	} );

	const directoryHash = path.basename( workDirectoryPath );

	spinner.text = 'Removing docker volumes.';
	await removeDockerItems( 'volume', 'name', directoryHash );

	spinner.text = 'Removing docker networks.';
	await removeDockerItems( 'network', 'name', directoryHash );

	spinner.text = 'Removing docker images.';
	await removeDockerItems( 'image', 'reference', directoryHash + '*' );

	spinner.text = 'Removing local files.';

	await rimraf( workDirectoryPath );

	spinner.text = 'Removed WordPress environment.';
};

/**
 * Removes docker items, like networks or volumes, matching the given name.
 *
 * @param {string} itemType    The item type, like "volume", or "network".
 * @param {string} filter      The filtering to search using.
 * @param {string} filterValue The filtering value that we're looking for.
 */
async function removeDockerItems( itemType, filter, filterValue ) {
	const { stdout: items } = await exec(
		`docker ${ itemType } ls -q --filter ${ filter }='${ filterValue }'`
	);
	if ( items ) {
		await exec(
			`docker ${ itemType } rm ${ items
				.split( '\n' ) // TODO: use os.EOL?
				.join( ' ' ) }`
		);
	}
}
