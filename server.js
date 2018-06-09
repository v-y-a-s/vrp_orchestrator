var http = require("https");
var axios = require("axios");
var js2xmlparser = require("js2xmlparser");
var fs = require('memfs');
var NodeGeocoder = require('node-geocoder');
var Ajv = require('ajv');
var ajv = new Ajv({ allErrors: true });
var express = require("express");
var bodyParser = require('body-parser');
var contentDisposition = require('content-disposition');
var app = express();
var port = process.env.PORT || 3000;

var opta = 'https://cvrpsolverhfc882521.us3.hana.ondemand.com';
var vrp_wrapper = 'https://opt.cfapps.us10.hana.ondemand.com';

// body parse only for JSON payloads 
app.use(bodyParser.json());
// Parse for urlencoded payload
app.use(bodyParser.urlencoded({
    extended: true
}));

app.post('/optimize', function (req, res) {

    // init method 
    do_it();
    // init method def 
    async function do_it() {
        var tracker = {}
        tracker.do_continue = 1;
        if (tracker.do_continue === 1) {
            console.log("enter");
            // vrp_file_path is the response object from the call 
            var vrp_file_path = await generateVrpPath(req.body);
            console.log(vrp_file_path.data);
            if (vrp_file_path.status === 200) {
                console.log(vrp_file_path.data);
                // res.status(200).type('application/json').send({
                //     result : vrp_file_path.data
                // });
            }
            else {
                tracker.do_continue = 0;
                tracker.do_continue_change_step = "VRP File Gen Failed";
                res.status(vrp_file_path.status).type('application/json').send({
                    result: vrp_file_path.data
                });
            }
        }

        if (tracker.do_continue === 1) {
            // get the vrp file created 
            var vrp_file = await getVRPFile();
            console.log(vrp_file_path);
            if (vrp_file.status === 200) {
                //console.log(vrp_file.headers['content-disposition']);
                var filename = "";
                var disposition = vrp_file.headers['content-disposition'];
                if (disposition && disposition.indexOf('attachment') !== -1) {
                    var filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
                    var matches = filenameRegex.exec(disposition);
                    if (matches != null && matches[1]) {
                        filename = matches[1].replace(/['"]/g, '');
                    }
                }
                // setting file and its name in tracker 
                tracker.vrp_file_name = filename.substring(1);
                tracker.vrp_file_data = vrp_file.data;
            }
            else {
                tracker.do_continue = 0;
                tracker.do_continue_change_step = "VRP File Fetch Failed";
                res.status(vrp_file.status).type('application/json').send({
                    result: vrp_file.data
                });
            }
        }

        if (tracker.do_continue === 1) {
            // upload the vrp file to opta serverlet 
            var vrp_file_upload = await uploadVRPFile(tracker);
            console.log(vrp_file_upload.data);
            if (vrp_file_upload.status === 200) {
                tracker.do_continue === 1;
            }
            else {
                tracker.do_continue = 0;
                tracker.do_continue_change_step = "VRP File Upload to Opta Planner Failed";
                res.status(vrp_file_upload.status).type('application/json').send({
                    result: vrp_file_upload.data
                });
            }
        }

        if (tracker.do_continue === 1) {
            // upload the vrp file to opta serverlet 
            var vrp_setsFileName = await setsFileName(tracker);
            console.log(vrp_setsFileName.data);
            if (vrp_setsFileName.status === 200) {
                tracker.do_continue == 1;
            }
            else {
                tracker.do_continue = 0;
                tracker.do_continue_change_step = "Stting VRP Dataset File Name in Opta Planner Failed";
                res.status(vrp_setsFileName.status).type('application/json').send({
                    result: vrp_setsFileName.data
                });
            }
        }

        if (tracker.do_continue === 1) {
            // Solve the VRP Problem
            var vrp_solver = await startSolving(tracker);
            console.log(vrp_solver.data);
            if (vrp_solver.status === 200) {
                res.status(200).type('application/json').send({
                    result: vrp_solver.data
                });
            }
            else {
                tracker.do_continue = 0;
                tracker.do_continue_change_step = "Call to Start Solving VRP Solution Failed";
                res.status(vrp_solver.status).type('application/json').send({
                    result: vrp_solver.data
                });
            }
        }

    }
});

async function generateVrpPath(payload) {
    try {
        const call_result = await axios({
            method: 'post',
            url: vrp_wrapper+'/go',
            data: payload
        });
        return call_result;
    } catch (error) {
        var err = {};
        err.status = 400;
        err.data = "Call to /go failed with error : " + error;
        return err;
    }
}

async function getVRPFile() {
    try {
        const call_result = await axios({
            method: 'get',
            url: vrp_wrapper+'/vrp'
        });
        return call_result;
    } catch (error) {
        var err = {};
        err.status = 400;
        err.data = "Call to /vrp failed with error : " + error;
        return err;
    }
}

async function uploadVRPFile(tracker) {
    try {
        const call_result = await axios({
            method: 'post',
            url: opta + '/solver/UploadDownloadFileServlet',
            data: tracker.vrp_file_data,
            headers: { 'filename': tracker.vrp_file_name }
        });
        return call_result;
    } catch (error) {
        var err = {};
        err.status = 400;
        err.data = "Call to /UploadDownloadFileServlet failed with error : " + error;
        return err;
    }
}

async function setsFileName(tracker) {
    try {
        const call_result = await axios({
            method: 'get',
            url: opta + '/solver/vehiclerouting/setsFileName',
            headers: { 'fileName': tracker.vrp_file_name }
        });
        return call_result;
    } catch (error) {
        var err = {};
        err.status = 400;
        err.data = "Call to /setsFileName failed with error : " + error;
        return err;
    }
}

async function startSolving(tracker) {
    try {
        const call_result = await axios({
            method: 'post',
            url: opta + '/solver/vehiclerouting/solution/solve'
        });
        return call_result;
    } catch (error) {
        var err = {};
        err.status = 400;
        err.data = "Call to /solver/vehiclerouting/solution/solve failed with error : " + error;
        return err;
    }
}

app.get('/solution/json', function (req, res) {
    // init method 
    do_it();
    // init method def 
    async function do_it() {
        var tracker = {}
        tracker.do_continue = 1;
        if (tracker.do_continue === 1) {
            console.log("enter solution fetcher");

            var vrp_solution = await getSolution();
            console.log(vrp_solution.data);
            if (vrp_solution.status === 200) {
                tracker.vrp_solution = vrp_solution.data;
                console.log(vrp_solution.data);
            }
            else {
                tracker.do_continue = 0;
                tracker.do_continue_change_step = "Getting VRP Solution Failed";
                res.status(vrp_solution.status).type('application/json').send({
                    result: vrp_solution.data
                });
            }
        }

        if (tracker.do_continue === 1) {
            // Parse generated VRP Solution to JSON
            var parsed_vrp_solution = await parseJSONSolution(tracker);
            console.log(parsed_vrp_solution);
            if (parsed_vrp_solution.status === 200) {
                tracker.parsed_vrp_solution = parsed_vrp_solution.data;
                res.status(parsed_vrp_solution.status).type('application/json').send(
                    parsed_vrp_solution.data
                );
            }
            else {
                tracker.do_continue = 0;
                tracker.do_continue_change_step = "VRP Solution JSON Parsing Fetch Failed";
                res.status(parsed_vrp_solution.status).type('application/json').send({
                    result: parsed_vrp_solution.data
                });
            }
        }
    }
});

async function getSolution() {
    try {
        const call_result = await axios({
            method: 'get',
            url: opta + '/solver/vehiclerouting/solution'
        });
        return call_result;
    } catch (error) {
        var err = {};
        err.status = 400;
        err.data = "Call to /solver/vehiclerouting/solution failed with error : " + error;
        return err;
    }
}

async function parseJSONSolution(tracker) {
    try {
        const call_result = await axios({
            method: 'post',
            url: vrp_wrapper+'/parser/json',
            data: tracker.vrp_solution,
        });
        return call_result;
    } catch (error) {
        var err = {};
        err.status = 400;
        err.data = "Call to /parser/json : " + error;
        return err;
    }
}

app.get('/solution/xml', function (req, res) {
    // init method 
    do_it();
    // init method def 
    async function do_it() {
        var tracker = {}
        tracker.do_continue = 1;
        if (tracker.do_continue === 1) {
            console.log("enter solution fetcher");

            var vrp_solution = await getSolution();
            console.log(vrp_solution.data);
            if (vrp_solution.status === 200) {
                tracker.vrp_solution = vrp_solution.data;
                console.log(vrp_solution.data);
            }
            else {
                tracker.do_continue = 0;
                tracker.do_continue_change_step = "Getting VRP Solution Failed";
                res.status(vrp_solution.status).type('application/json').send({
                    result: vrp_solution.data
                });
            }
        }

        if (tracker.do_continue === 1) {
            // Parse generated VRP Solution to JSON
            var parsed_vrp_solution = await parseXMLSolution(tracker);
            console.log(parsed_vrp_solution);
            if (parsed_vrp_solution.status === 200) {
                tracker.parsed_vrp_solution = parsed_vrp_solution.data;
                res.status(parsed_vrp_solution.status).type('application/xml').send(
                    parsed_vrp_solution.data
                );
            }
            else {
                tracker.do_continue = 0;
                tracker.do_continue_change_step = "VRP Solution JSON Parsing Fetch Failed";
                res.status(parsed_vrp_solution.status).type('application/json').send({
                    result: parsed_vrp_solution.data
                });
            }
        }
    }
});

async function parseXMLSolution(tracker) {
    try {
        const call_result = await axios({
            method: 'post',
            url: vrp_wrapper+'/parser/xml',
            data: tracker.vrp_solution,
        });
        return call_result;
    } catch (error) {
        var err = {};
        err.status = 400;
        err.data = "Call to /parser/xml : " + error;
        return err;
    }
}

app.listen(port);